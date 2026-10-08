// Export one physical PDF page so AirPrint does not paginate the HTML again.
export async function printPartnerPdf() {
  const preview=window.open('about:blank','_blank');
  if(preview){preview.document.title='Preparando relatório';preview.document.body.textContent='Preparando relatório para impressão…';}
  try {
    const element=document.querySelector<HTMLElement>('.gg-print-sheet');
    if(!element)throw new Error('Relatório indisponível.');
    const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')]);
    await document.fonts.ready;
    await Promise.all(Array.from(element.querySelectorAll('img')).map(image=>image.decode().catch(()=>undefined)));
    const images=Array.from(element.querySelectorAll('img'));
    // Bound canvas memory for iPhones when a month contains many operations.
    const pixelScale=Math.min(3,Math.sqrt(12_000_000/(element.scrollWidth*element.scrollHeight)),8192/Math.max(element.scrollWidth,element.scrollHeight));
    const canvas=await html2canvas(element,{
      scale:pixelScale,backgroundColor:'#ffffff',useCORS:true,logging:false,
      windowWidth:1123,windowHeight:794,
      onclone:doc=>{
        const page=doc.querySelector<HTMLElement>('.gg-print-page')!;
        const sheet=doc.querySelector<HTMLElement>('.gg-print-sheet')!;
        page.style.cssText='position:absolute;left:0;top:0;width:281mm;height:auto;visibility:visible;overflow:visible;pointer-events:none';
        sheet.style.transform='none';sheet.style.zoom='1';sheet.style.position='relative';sheet.style.visibility='visible';
        sheet.querySelectorAll('img').forEach((image,index)=>{
          const source=images[index];
          if(!source?.naturalWidth||!source.naturalHeight)return;
          const ratio=Math.min(48/source.naturalWidth,42/source.naturalHeight);
          image.style.width=`${source.naturalWidth*ratio}px`;image.style.height=`${source.naturalHeight*ratio}px`;
        });
      },
    });
    const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
    const scale=Math.min(277/canvas.width,190/canvas.height);
    const width=canvas.width*scale,height=canvas.height*scale;
    pdf.setProperties({title:'Relatório de produção e repasses — GG Veículos',author:'TF Assessoria & Finanças'});
    pdf.addImage(canvas,'PNG',(297-width)/2,10,width,height,undefined,'FAST');
    const url=URL.createObjectURL(pdf.output('blob'));
    if(preview&&!preview.closed)preview.location.replace(url);
    else {const link=document.createElement('a');link.href=url;link.download='Relatorio-GG-Veiculos.pdf';link.click();}
    window.setTimeout(()=>URL.revokeObjectURL(url),10*60*1000);
  } catch(error) {
    preview?.close();
    throw error;
  }
}
