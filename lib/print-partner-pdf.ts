import type { jsPDF } from 'jspdf';

// Draw text as PDF text, not a browser screenshot. This avoids Safari canvas
// baseline clipping and keeps small print sharp at any zoom level.
function drawReport(pdf: jsPDF, sheet: HTMLElement) {
  const width=1062;
  const commands: Array<(scale:number)=>void>=[];
  const ink='#25333f',muted='#65717b',red='#a32136',gold='#876a35';
  const content=(node:Element|null)=>node?.textContent?.trim()??'';
  const select=(selector:string)=>sheet.querySelector(selector);
  const text=(value:string,x:number,y:number,size=10,bold=false,color=ink,align:'left'|'right'='left')=>{
    commands.push(scale=>{
      pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size*scale);pdf.setTextColor(color);
      pdf.text(value.replace(/−/g,'-').replace(/\u00a0/g,' '),offsetX+x*scale,24+y*scale,{align});
    });
  };
  const box=(x:number,y:number,w:number,h:number,fill:string)=>commands.push(scale=>{
    pdf.setFillColor(fill);pdf.rect(offsetX+x*scale,24+y*scale,w*scale,h*scale,'F');
  });
  const line=(x:number,y:number,w:number,color='#dbe1e5')=>commands.push(scale=>{
    pdf.setDrawColor(color);pdf.setLineWidth(.7*scale);pdf.line(offsetX+x*scale,24+y*scale,offsetX+(x+w)*scale,24+y*scale);
  });
  const wrap=(value:string,w:number,size:number,bold=false):string[]=>{
    pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);
    return pdf.splitTextToSize(value.replace(/\u00a0/g,' '),w) as string[];
  };
  sheet.querySelectorAll<HTMLImageElement>('.ggp-brand img').forEach((image,i)=>{
    if(!image.naturalWidth)return;
    const ratio=Math.min(48/image.naturalWidth,48/image.naturalHeight);
    commands.push(scale=>pdf.addImage(image,'PNG',offsetX+i*58*scale,24, image.naturalWidth*ratio*scale,image.naturalHeight*ratio*scale));
  });
  text(content(select('.ggp-header small')),130,10,8,false,gold);
  text(content(select('.ggp-header h1')),130,36,23,true);
  text(content(select('.ggp-header p')),130,54,12,false,muted);
  text(content(select('.ggp-header aside b')),width,25,12,true,ink,'right');
  text('DEMONSTRATIVO MENSAL',width,43,8,false,muted,'right');
  line(0,68,width,gold);
  box(0,83,width,62,'#f2f4f5');
  let sx=0;
  sheet.querySelectorAll('.ggp-summary>div').forEach((item,i)=>{
    text(content(item.querySelector('small')),sx+16,102,8,true,muted);
    text(content(item.querySelector('strong')),sx+16,129,19,true);
    sx+=[335,278,278,171][i];
  });
  text('Detalhamento das operações',0,169,12,true);
  text('Valores em reais · agrupados por origem',width,169,8,false,muted,'right');
  const widths=[20,5,9,7,8,7,6,7,6,8,8.5,8.5].map(n=>n*width/100);
  let y=180;
  const headers=Array.from(sheet.querySelectorAll('.ggp-table thead th'));
  const headerLines=headers.map((item,i)=>wrap(content(item),widths[i]-12,9,true));
  const headHeight=Math.max(...headerLines.map(lines=>lines.length))*11+12;
  box(0,y,width,headHeight,ink);
  let x=0;
  headerLines.forEach((lines,i)=>{
    lines.forEach((value,j)=>text(value,i<4?x+6:x+widths[i]-6,y+12+j*11,9,true,'#ffffff',i<4?'left':'right'));
    x+=widths[i];
  });
  y+=headHeight;
  let rowIndex=0;
  sheet.querySelectorAll('.ggp-table tbody tr').forEach(row=>{
    if(row.classList.contains('ggp-source')){
      const cell=row.querySelector('th')!;
      const label=Array.from(cell.childNodes).filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim();
      const isGG=row.classList.contains('gg');
      box(0,y,width,22,isGG?'#fbe8ec':'#eaf0f6');box(0,y,3,22,isGG?red:'#537da0');
      text(label,10,y+15,10,true,isGG?red:'#355571');
      text(content(cell.querySelector('span')),width-9,y+15,8,false,isGG?red:'#355571','right');
      y+=22;return;
    }
    const cells=Array.from(row.querySelectorAll('td'));
    if(cells.length===1){text(content(cells[0]),8,y+17,10,false,muted);y+=28;return;}
    const lines=cells.map((cell,i)=>{
      const primary=cell.cloneNode(true) as HTMLElement;primary.querySelectorAll('small').forEach(n=>n.remove());
      return {main:wrap(content(primary),widths[i]-12,i===0?11:9,i===0||i===11),sub:wrap(content(cell.querySelector('small')),widths[i]-12,8)};
    });
    const height=Math.max(...lines.map(l=>l.main.length*12+(l.sub[0]?l.sub.length*9:0)))+6;
    if(rowIndex++%2===0)box(0,y,width,height,'#f7f9fa');
    x=0;
    lines.forEach((cell,i)=>{
      cell.main.forEach((value,j)=>text(value,i<4?x+6:x+widths[i]-6,y+11+j*12,i===0?11:9,i===0||i===11,i===11?red:ink,i<4?'left':'right'));
      cell.sub.forEach((value,j)=>text(value,i<4?x+6:x+widths[i]-6,y+11+cell.main.length*12+j*9,8,false,muted,i<4?'left':'right'));
      x+=widths[i];
    });
    y+=height;line(0,y,width);
  });
  const adjustments=select('.ggp-adjustments');
  if(adjustments){
    y+=10;
    const lines=wrap(content(adjustments),width-20,9);
    box(0,y,width,lines.length*13+16,'#fff7ed');
    lines.forEach((value,i)=>text(value,10,y+14+i*13,9,false,gold));
    y+=lines.length*13+16;
  }
  y+=20;
  text('Fechamento financeiro',0,y+12,12,true);
  let cy=y+32;
  sheet.querySelectorAll('.ggp-costs dl>div').forEach(item=>{
    if(item.classList.contains('ggp-net'))line(0,cy-12,390);
    text(content(item.querySelector('dt')),0,cy,10,item.classList.contains('ggp-net'));
    text(content(item.querySelector('dd')),390,cy,10,true,ink,'right');cy+=20;
  });
  sheet.querySelectorAll('.ggp-payout').forEach((item,i)=>{
    const px=416+i*330,color=i===0?red:gold;
    box(px,y,316,120,i===0?'#fff5f7':'#faf7f0');box(px,y,316,3,color);
    text(content(item.querySelector('small')),px+16,y+34,9,true,color);
    text(content(item.querySelector('strong')),px+16,y+73,25,true,color);
    text(content(item.querySelector('span')),px+16,y+96,9,false,muted);
  });
  y=Math.max(cy,y+120)+16;
  const comparison=select('.ggp-comparison')!;
  box(0,y,width,50,'#f2f5f7');
  text(content(comparison.querySelector('b')),12,y+20,9,true);
  Array.from(comparison.children).filter(n=>n.tagName==='SPAN').forEach((item,i)=>text(content(item),12+i*330,y+37,9,false,muted));
  const em=comparison.querySelector('em')!;
  text(Array.from(em.childNodes).filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join(''),width-12,y+22,14,true,'#355571','right');
  text(content(em.querySelector('small')),width-12,y+39,8,false,muted,'right');
  y+=68;line(0,y,width);
  text(content(select('.ggp-footer b')),0,y+20,9,false,muted);
  text(content(select('.ggp-footer>span')),width,y+20,9,false,muted,'right');
  // All content, including the footer's full line and bottom clearance, is
  // measured before drawing; there is exactly one physical A4 page.
  const scale=Math.min((pdf.internal.pageSize.getWidth()-48)/width,(pdf.internal.pageSize.getHeight()-48)/(y+32));
  const offsetX=(pdf.internal.pageSize.getWidth()-width*scale)/2;
  commands.forEach(draw=>draw(scale));
}

export async function printPartnerPdf() {
  const preview=window.open('about:blank','_blank');
  if(preview){preview.document.title='Preparando relatório';preview.document.body.textContent='Preparando relatório para impressão…';}
  try {
    const element=document.querySelector<HTMLElement>('.gg-print-sheet');
    if(!element)throw new Error('Relatório indisponível.');
    const {jsPDF}=await import('jspdf');
    await Promise.all(Array.from(element.querySelectorAll('img')).map(image=>image.decode().catch(()=>undefined)));
    const pdf=new jsPDF({orientation:'landscape',unit:'pt',format:'a4',compress:true});
    pdf.setProperties({title:'Relatório de produção e repasses — GG Veículos',author:'TF Assessoria & Finanças'});
    drawReport(pdf,element);
    const url=URL.createObjectURL(pdf.output('blob'));
    if(preview&&!preview.closed)preview.location.replace(url);
    else {const link=document.createElement('a');link.href=url;link.download='Relatorio-GG-Veiculos.pdf';link.click();}
    window.setTimeout(()=>URL.revokeObjectURL(url),10*60*1000);
  } catch(error) {
    preview?.close();
    throw error;
  }
}
