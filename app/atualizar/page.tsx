"use client";

import { useEffect, useState } from "react";

export default function AtualizarSistema() {
  const [message, setMessage] = useState("Limpando a versão antiga…");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
        if (!active) return;
        setMessage("Sistema atualizado. Abrindo a versão nova…");
        window.setTimeout(() => window.location.replace("/?versao=143"), 500);
      } catch {
        if (!active) return;
        setMessage("Atualização concluída. Abrindo o sistema…");
        window.setTimeout(() => window.location.replace("/?versao=143"), 500);
      }
    })();
    return () => { active = false; };
  }, []);

  return <main style={{minHeight:"100dvh",display:"grid",placeItems:"center",background:"#0c0e0c",color:"#f3ead8",fontFamily:"Inter,system-ui,sans-serif",padding:24,textAlign:"center"}}><section><div style={{width:42,height:42,border:"3px solid #4a4439",borderTopColor:"#d6ad61",borderRadius:"50%",margin:"0 auto 18px",animation:"spin .8s linear infinite"}}/><h1 style={{fontSize:22,margin:"0 0 8px"}}>Gestão TF</h1><p style={{margin:0,color:"#b9b2a5"}}>{message}</p><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></section></main>;
}
