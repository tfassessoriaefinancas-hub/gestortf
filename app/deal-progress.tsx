type Props = { step: number; total: number; stage: string; createdAt?: number };

export default function DealProgress({ step, total, stage, createdAt }: Props) {
  const percent = total > 1 ? Math.round(Math.max(0, Math.min(step, total - 1)) / (total - 1) * 100) : 0;
  const date = createdAt ? new Date(createdAt) : null;
  const validDate = date && Number.isFinite(date.getTime()) ? date : null;
  return <div className="tf-deal-progress">
    <div className="tf-deal-progress-ring" role="progressbar" aria-label={`Progresso do atendimento: ${stage}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="tf-progress-track" cx="32" cy="32" r="27"/>
        <circle className="tf-progress-value" cx="32" cy="32" r="27" pathLength="100" strokeDasharray={`${percent} 100`} transform="rotate(-90 32 32)"/>
      </svg>
      <div className="tf-progress-center"><strong>{percent}<small>%</small></strong><span>{percent === 100 ? "Finalizado" : percent === 0 ? "Início" : "Em curso"}</span></div>
    </div>
    <div className="tf-deal-progress-copy">
      <span className="tf-deal-stage-label">Etapa {step + 1} de {total}</span>
      <span className="tf-deal-included">{validDate ? <><span>Incluído em</span><time dateTime={validDate.toISOString()}>{validDate.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Fortaleza'})}</time></> : 'Data de inclusão não registrada'}</span>
      <span className="tf-deal-progress-caption">Progresso do atendimento</span>
    </div>
  </div>;
}
