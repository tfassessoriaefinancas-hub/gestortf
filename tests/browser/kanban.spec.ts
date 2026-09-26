import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { PostgresDatabase } from '../../lib/postgres';

const origin='http://127.0.0.1:3100';
async function login(request:APIRequestContext){
  const response=await request.post('/api/auth/login',{headers:{origin},data:{email:'admin@example.com',password:'test-only-password'}});
  expect(response.ok(),await response.text()).toBeTruthy();
}
async function create(request:APIRequestContext,data:Record<string,unknown>){
  const response=await request.post('/api/deals',{data});
  expect(response.status(),await response.text()).toBe(201);
  return (await response.json()).deal;
}
async function board(page:Page){
  await page.locator('.tf-side nav').getByRole('button',{name:'Atendimento',exact:true}).click();
  await expect(page.locator('.tf-kanban')).toBeVisible();
}

test('optional client data stays separate and financial edits preserve the original IDs and omitted fields',async({request})=>{
  await login(request);
  const first=await create(request,{name:'Cliente opcional A',product:'Crédito com garantia',guaranteeType:'Imobiliário',desiredCredit:15000.37});
  const second=await create(request,{name:'Cliente opcional B',product:'Financiamento',vehicleValue:95000.41,downPayment:30000.11,financedValue:65000.30});
  expect(first.clientId).not.toBe(second.clientId);
  expect(first.operationId).not.toBe(second.operationId);
  const db=new PostgresDatabase();
  try {
    await db.prepare("UPDATE operations SET vehicle_plate='ABC1D23',source_row='origem preservada' WHERE id=?").bind(second.operationId).run();
    const edit=await request.patch('/api/deals',{data:{id:second.id,action:'edit',details:{name:'Cliente opcional B editado',downPayment:31000.19,financedValue:64000.22}}});
    expect(edit.ok(),await edit.text()).toBeTruthy();
    const list=(await (await request.get('/api/deals')).json()).deals;
    expect(list.find((row:{id:number})=>row.id===first.id)).toMatchObject({name:'Cliente opcional A',cpf:'',guaranteeType:'Imobiliário',agreement:'Imóvel',desiredCredit:15000.37,clientId:first.clientId,operationId:first.operationId});
    expect(list.find((row:{id:number})=>row.id===second.id)).toMatchObject({name:'Cliente opcional B editado',vehicleValue:95000.41,downPayment:31000.19,financedValue:64000.22,value:64000.22,clientId:second.clientId,operationId:second.operationId});
    expect(await db.prepare('SELECT vehicle_value_cents,down_payment_cents,financed_value_cents,vehicle_plate,source_row FROM operations WHERE id=?').bind(second.operationId).first()).toEqual({vehicle_value_cents:9500041,down_payment_cents:3100019,financed_value_cents:6400022,vehicle_plate:'ABC1D23',source_row:'origem preservada'});
    const duplicate=await request.post('/api/deals',{data:{name:'Outro nome com o mesmo CPF',cpf:'11111111111',product:'Financiamento'}});
    expect(duplicate.status()).toBe(409);
    expect(await db.prepare('SELECT COUNT(*) AS count FROM clients WHERE cpf IS NULL AND id IN (?,?)').bind(first.clientId,second.clientId).first('count')).toBe(2);
    const invalid=await request.post('/api/deals',{data:{name:'CPF incompleto',cpf:'123',product:'FGTS'}});
    expect(invalid.status()).toBe(400);
  }finally{await db.close();}
});

test('moving a new service never replaces it with an older completed operation for the same CPF',async({request})=>{
  await login(request);
  const old=await create(request,{name:'Cliente com dois serviços',cpf:'77888999000',product:'Financiamento',financedValue:1000});
  const db=new PostgresDatabase();
  try {
    await db.prepare("UPDATE operations SET completed_at='2026-09-01',status='Finalizado' WHERE id=?").bind(old.operationId).run();
    await db.prepare("UPDATE deals SET stage='finalizado',status='concluido' WHERE id=?").bind(old.id).run();
    const current=await create(request,{name:'Cliente com dois serviços',cpf:'77888999000',product:'Crédito com garantia',guaranteeType:'Veículo',desiredCredit:2500});
    expect(current.clientId).toBe(old.clientId);
    expect(current.operationId).not.toBe(old.operationId);
    for(const stage of ['analise','finalizado','assinatura','finalizado']){
      const response=await request.patch('/api/deals',{data:{id:current.id,stage}});
      expect(response.ok(),await response.text()).toBeTruthy();
      const before=await db.prepare('SELECT COUNT(*) AS count FROM deal_history WHERE deal_id=?').bind(current.id).first('count');
      const list=(await (await request.get('/api/deals')).json()).deals;
      expect(list.find((row:{id:number})=>row.id===current.id)).toMatchObject({id:current.id,stage,clientId:current.clientId,operationId:current.operationId,product:'Crédito com garantia',value:2500});
      expect(await db.prepare('SELECT COUNT(*) AS count FROM deal_history WHERE deal_id=?').bind(current.id).first('count')).toBe(before);
    }
    expect(await db.prepare('SELECT completed_at FROM operations WHERE id=?').bind(current.operationId).first('completed_at')).toBeNull();
  }finally{await db.close();}
});

test('new card forms reset between clients, offer the requested amounts and share hierarchy and colors in both themes',async({page})=>{
  test.setTimeout(120000);page.setDefaultTimeout(10000);
  const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await login(page.request);await page.goto('/');await board(page);
  const open=async(product:string)=>{
    await page.locator('[data-stage="atendimento"] > footer').getByRole('button',{name:'Novo atendimento',exact:true}).click();
    const form=page.locator('.tf-create-deal-modal');
    await expect(form).toBeVisible();
    expect(pageErrors).toEqual([]);
    await form.getByRole('combobox',{name:'Serviço',exact:true}).selectOption(product);
    await form.getByRole('button',{name:'Continuar',exact:true}).click();
    return form;
  };
  const form=await open('Crédito com garantia');
  await form.getByLabel('Nome completo',{exact:true}).fill('Cliente visual imóvel');
  await expect(form.getByRole('combobox',{name:'Tipo de garantia',exact:true})).toHaveValue('Veículo');
  await form.getByRole('combobox',{name:'Tipo de garantia',exact:true}).selectOption('Imobiliário');
  await form.getByLabel('Valor desejado',{exact:true}).fill('80.123,45');
  await expect(form.getByLabel('Valor total do veículo',{exact:true})).toHaveCount(0);
  const saved=page.waitForResponse(response=>response.url().endsWith('/api/deals')&&response.request().method()==='POST');
  await form.getByRole('button',{name:'Iniciar atendimento',exact:true}).click();
  const first=(await (await saved).json()).deal;
  await expect(form).toBeHidden();
  const next=await open('Financiamento');
  await expect(next.getByLabel('Nome completo',{exact:true})).toHaveValue('');
  await expect(next.getByLabel('CPF',{exact:true})).toHaveValue('');
  await next.getByLabel('Nome completo',{exact:true}).fill('Cliente visual financiamento');
  await next.getByLabel('Valor total do veículo',{exact:true}).fill('90.000,50');
  await next.getByLabel('Entrada',{exact:true}).fill('20.000,25');
  await next.getByLabel('Valor do financiamento',{exact:true}).fill('70.000,25');
  const savedNext=page.waitForResponse(response=>response.url().endsWith('/api/deals')&&response.request().method()==='POST');
  await next.getByRole('button',{name:'Iniciar atendimento',exact:true}).click();
  const second=(await (await savedNext).json()).deal;
  await expect(next).toBeHidden();
  const firstCard=page.locator(`[data-deal-id="${first.id}"]`),secondCard=page.locator(`[data-deal-id="${second.id}"]`);
  for(const theme of ['classic','mono']){
    if(!(await page.locator('.tf-app').getAttribute('class'))?.includes(`theme-${theme}`))await page.locator('.tf-side nav').getByRole('button',{name:'Usar tema Preto Luxo',exact:true}).click();
    await expect(firstCard).toContainText('Imobiliário');
    await expect(firstCard.locator('.tf-card-heading')).toHaveText('Crédito com garantiaCliente visual imóvel');
    const product=await firstCard.locator('.tf-card-product').boundingBox(),name=await firstCard.locator('.tf-card-heading strong').boundingBox();
    expect(product!.y+product!.height).toBeLessThanOrEqual(name!.y);
    const colors=await Promise.all([firstCard,secondCard].map(card=>card.evaluate(element=>getComputedStyle(element).backgroundImage)));
    expect(colors[0]).not.toBe(colors[1]);
    for(const card of [firstCard,secondCard]){
      const contained=await card.evaluate(element=>{const rect=element.getBoundingClientRect();return [...element.querySelectorAll('.tf-card-actions button')].every(button=>button.getBoundingClientRect().right<=rect.right);});
      expect(contained).toBe(true);
    }
    await page.screenshot({path:`test-results/kanban-${theme}.png`,fullPage:true});
  }
  await secondCard.getByRole('button',{name:'Opções de Cliente visual financiamento',exact:true}).click();
  await secondCard.getByRole('button',{name:'Editar cadastro',exact:true}).click();
  const edit=page.locator('.tf-edit-deal-modal');
  await expect(edit.getByLabel('Entrada',{exact:true})).toHaveValue(/20\.000,25/);
  await expect(edit.getByLabel('Valor do financiamento',{exact:true})).toHaveValue(/70\.000,25/);
  await edit.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.locator('[data-stage="analise"] > footer').getByRole('button',{name:'Adicionar negócio',exact:true}).click();
  await expect(page.locator('.tf-create-deal-modal')).toBeVisible();
  await page.locator('.tf-create-deal-modal .tf-modal-close').click();
  await page.getByRole('button',{name:'Upload de documento',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Upload de CNH ou identidade',exact:true})).toBeVisible();
  await page.locator('.tf-modal-back .tf-modal-close').click();
  expect(pageErrors).toEqual([]);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
  await page.screenshot({path:'test-results/kanban-mobile.png',fullPage:true});
});

test('a delayed refresh cannot undo a drag and failed moves are visible without losing the saved stage',async({page})=>{
  test.setTimeout(120000);
  await login(page.request);
  const deal=await create(page.request,{name:'Cliente de arraste',product:'FGTS'});
  await page.goto('/');await board(page);
  const card=page.locator(`[data-deal-id="${deal.id}"]`);
  await expect(card).toBeVisible();
  let release!:()=>void,held!:()=>void,intercepted=false;
  const releaseGate=new Promise<void>(resolve=>{release=resolve}),snapshotReady=new Promise<void>(resolve=>{held=resolve});
  await page.route('**/api/deals?*',async route=>{
    const response=await route.fetch();
    if(!intercepted){intercepted=true;held();await releaseGate;}
    try{await route.fulfill({response});}catch{/* Refresh may have been aborted by the mutation. */}
  });
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await snapshotReady;
  await card.dragTo(page.locator('[data-stage="analise"]'));
  await expect(page.locator(`[data-stage="analise"] [data-deal-id="${deal.id}"]`)).toBeVisible();
  release();await page.waitForLoadState('networkidle');
  await expect(page.locator(`[data-stage="analise"] [data-deal-id="${deal.id}"]`)).toBeVisible();
  await page.unroute('**/api/deals?*');
  const data=await page.evaluateHandle(()=>new DataTransfer());
  await card.dispatchEvent('dragstart',{dataTransfer:data});
  await page.locator('[data-stage="finalizado"]').dispatchEvent('drop',{dataTransfer:data});
  await expect(page.locator(`[data-stage="finalizado"] [data-deal-id="${deal.id}"]`)).toContainText('FINALIZAR CADASTRO');
  await page.reload();await board(page);
  await expect(page.locator(`[data-stage="finalizado"] [data-deal-id="${deal.id}"]`)).toBeVisible();
  await page.route('**/api/deals',route=>route.request().method()==='PATCH'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Falha temporária de teste'})}):route.continue());
  const failedMoveData=await page.evaluateHandle(()=>new DataTransfer());
  await card.dispatchEvent('dragstart',{dataTransfer:failedMoveData});
  await page.locator('[data-stage="assinatura"]').dispatchEvent('drop',{dataTransfer:failedMoveData});
  await expect(page.locator('.tf-kanban-error[role="alert"]')).toHaveText('Falha temporária de teste');
  await expect(page.locator(`[data-stage="finalizado"] [data-deal-id="${deal.id}"]`)).toBeVisible();
});
