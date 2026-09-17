"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { productionSources, hasGgCode } from "../lib/production-source";
import { parseMoney as parseMoneyBr, formatMoney as brl, formatMoneyInput, moneyToStorage } from "../lib/money";
import { partnerAdditionalFinance, partnerFinance } from "../lib/operation-finance";
import { bankCatalog, bankInfo, bankNames } from "../lib/banks";
import { CRM_CHANGED, CRM_STORAGE_KEY, notifyCrmChanged } from "../lib/crm-events";
import type { CanonicalOperation } from "../lib/operations";
import {
  House,
  UsersRound,
  Columns3,
  FileChartColumn,
  Handshake,
  BriefcaseBusiness,
  BadgeDollarSign,
  ChartNoAxesCombined,
  ReceiptText,
  Landmark,
  ChartSpline,
  Settings as SettingsIcon,
  Search,
  Bell,
  LogOut,
  UserRoundCog,
  ExternalLink,
  Plus,
  ArrowUpRight,
  Menu,
  X,
  FileUp,
  FileText,
  Phone,
  MessageCircle,
  CalendarDays,
  History,
  CheckCircle2,
  Clock3,
  ChevronRight,
  Copy,
  Send,
  ShieldCheck,
  Banknote,
  CarFront,
  WalletCards,
  Umbrella,
  Briefcase,
  KeyRound,
  Paperclip,
  ScanText,
  Palette,
  Star,
  type LucideIcon,
} from "lucide-react";

type View =
  | "inicio"
  | "clientes"
  | "atendimento"
  | "producao"
  | "parceiros"
  | "servicos"
  | "comissoes"
  | "financeiro"
  | "notas"
  | "bancos"
  | "relatorios"
  | "posvenda"
  | "usuarios";
type Client = {
  id: number;
  dbId?: number;
  name: string;
  cpf: string;
  benefit: string;
  birth: string;
  phone: string;
  city: string;
  partner: string;
};
type Operation = CanonicalOperation;
type PartnerSettlementRecord={period:string;status:string;paidAt?:string;grossCommission?:number;feeRate?:number;tfShare?:number;bonus?:number;bonusDescription?:string};
type PartnerOperationAdjustment={operationId:number;ilaRate:number;invoiceRate:number;tfShare:number};
type PartnerBonusRecord={period:string;value:number;description?:string;source?:'legacy'|'manual'};
type PartnerRecord = { id: number; name: string; taxRate?:number; invoiceRate?:number; tfShare?:number; settlements?:PartnerSettlementRecord[]; adjustments?:PartnerOperationAdjustment[]; bonuses?:PartnerBonusRecord[] };
type Deal = {
  id: number;
  name: string;
  cpf: string;
  birthDate: string;
  product: string;
  stage: string;
  status?: string;
  needsCompletion?: boolean;
  createdAt?: number;
  updatedAt?: number;
  clientId?: number;
  operationId?: number;
  source?: string;
  origin?: string;
  bank?: string;
  promoter?: string;
  producer?: string;
  productionIndicator?: string;
  operationType?: string;
  agreement?: string;
  contractType?: string;
  dueDay?: string;
  installment?: string | number;
  value?: string | number;
  quotaQuantity?: string;
  quotaUnitValue?: string | number;
  fipeValue?: string | number;
  term?: string;
  contractStatus?: string;
  paidDate?: string;
  operationDate?: string;
  adhesionFee?: string | number;
  advisoryFee?: string | number;
  bonus?: string | number;
  commissionRate?: string;
  commissionCustomRate?: string;
  commissionInstallments?: string;
  commissionPaid?: string;
  commissionDueDate?: string;
  invoiceRequired?: string;
  invoiceNumber?: string;
  invoiceValue?: string | number;
  invoiceIssuedAt?: string;
  invoicePaid?: string;
  postSale?: string;
  postSaleNotes?: string;
  detailsJson?: string;
  phone?: string;
  returnAt?: string;
  returnReason?: string;
  returnNotes?: string;
  returnStatus?: string;
  lastConversation?: string;
  history?: Array<{at:number;type:string;conversation?:string;returnAt?:string;reason?:string}>;
  vehiclePlate?: string;
  vehicleValue?: string | number;
  financedValue?: string | number;
  desiredCredit?: string | number;
  loanValue?: string | number;
  assignedUserId?: number | null;
  assignedName?: string;
};
type TeamMember={password?:string;id:number;name:string;email:string;active:boolean;permissions:View[];partnerId:number|null;partnerName?:string};
type Receivable={id:number;operationId:number;name:string;value:number;dueDate:string;status:string;type:string;product:string};
type InvoiceRecord={id:number;number:string;clientName:string;partnerName?:string;value:number;issuedAt:string;paidAt?:string;status:string;fileName?:string};
type DashboardUser={name:string;email:string;role:"admin"|"employee";memberId:number|null;partnerId:number|null;permissions:string[];serverAuthenticated?:boolean};
type CatalogOption={id:number;kind:"indicator"|"promoter"|"production";label:string};
type PostSaleTask={id:number;operationId:number;clientId:number;status:"pendente"|"concluido";completedAt:number|null;clientName:string;phone:string;product:string;bank:string;value:number;installment:number;term:number;completionDate:string;partner:string;postSaleNotes?:string;postSale?:string};
const cpfKey = (cpf?: string) => String(cpf || "").replace(/\D/g, "");
const formatCpf = (cpf?: string) => {
  const d = cpfKey(cpf);
  return d.length === 11
    ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : cpf || "CPF não informado";
};
const maskCpf = (cpf: string) =>
  cpfKey(cpf)
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const phoneKey = (phone?: string) => {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
};
const maskPhone = (phone: string) => {
  const d = phoneKey(phone).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
const formatPhone = (phone?: string) =>
  phoneKey(phone) ? maskPhone(String(phone)) : "Não informado";
const maskDate = (value: string) => {
  const d = value.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};
const dateToIso = (value?: string) => {
  const v = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const match = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : v;
};
const formatDateBr = (value?: string) => {
  const v = String(value || "").trim();
  if (!v || v === "1900-01-01") return "—";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? v : parsed.toLocaleDateString("pt-BR");
};
function BankIdentity({ value, compact = false }: { value?: string | null; compact?: boolean }) {
  const info = bankInfo(value);
  return <span className={`tf-bank-identity${compact ? " compact" : ""}`}>{info && <i style={{ background: info.color }}>{info.code}</i>}<span>{value || "Não informado"}</span></span>;
}
function CurrencyInput({ value, defaultValue, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> & { value?: string | number; defaultValue?: string | number; onChange?: (value: string) => void }) {
  const [draft, setDraft] = useState(() => formatMoneyInput(defaultValue));
  const current = value === undefined ? draft : formatMoneyInput(value);
  const change = (next: string) => { setDraft(next); onChange?.(next); };
  return <input {...props}
    type="text"
    inputMode="decimal"
    value={current}
    onChange={event => {
      const digits = event.target.value.replace(/\D/g, "");
      change(digits ? formatMoneyInput(Number(digits) / 100) : "");
    }}
    onPaste={event => {
      event.preventDefault();
      const pasted = event.clipboardData.getData("text");
      if (/\d/.test(pasted)) change(formatMoneyInput(pasted));
    }}
    onBlur={() => change(formatMoneyInput(current))}
    placeholder={props.placeholder || "R$ 0,00"}
  />;
}
const productionCategory = (product: string) => {
  const p = product.toLowerCase();
  if (p.includes("financiamento")) return "Crédito";
  if (p.includes("inss") || p.includes("consign")) return "Consignado";
  if (p.includes("proteção") || p.includes("evogard") || p.includes("seguro"))
    return "Proteção";
  if (p.includes("consórcio")) return "Planejamento";
  return "Outros";
};
const serviceOrder=[
  "CLT",
  "FGTS",
  "INSS",
  "Seguros",
  "Consórcio",
  "Consignado",
  "Proteção Auto",
  "Financiamento",
  "Crédito com garantia",
  "Assessoria Financeira",
];
const productionProducts = [
  {
    name: "Assessoria Financeira",
    tone: "teal",
    match: (p: string) => {
      const value = p.toLowerCase();
      return value.includes("assessoria") || value.includes("educação financeira") || value.includes("consultoria financeira");
    },
  },
  {
    name: "CLT",
    tone: "violet",
    match: (p: string) => p.toLowerCase().includes("clt"),
  },
  {
    name: "Consignado",
    tone: "rose",
    match: (p: string) => p.toLowerCase().includes("consign"),
  },
  {
    name: "Crédito com garantia",
    tone: "blue",
    match: (p: string) => {
      const value = p.toLowerCase();
      return value.includes("garantia") || value.includes("home equity") || value.includes("veículo em garantia");
    },
  },
  {
    name: "Consórcio",
    tone: "green",
    match: (p: string) => p.toLowerCase().includes("consórcio"),
  },
  {
    name: "FGTS",
    tone: "orange",
    match: (p: string) => p.toLowerCase().includes("fgts"),
  },
  {
    name: "INSS",
    tone: "violet",
    match: (p: string) => p.toLowerCase().includes("inss"),
  },
  {
    name: "Financiamento",
    tone: "gold",
    match: (p: string) => p.toLowerCase().includes("financiamento") && !p.toLowerCase().includes("garantia"),
  },
  {
    name: "Proteção Auto",
    tone: "blue",
    match: (p: string) => {
      const value = p.toLowerCase();
      return value.includes("proteção auto") || value.includes("proteção veicular") || value.includes("seguro auto") || value.includes("evogard") || value.includes("rastreamento");
    },
  },
  {
    name: "Seguros",
    tone: "cyan",
    match: (p: string) => {
      const value = p.toLowerCase();
      return value.includes("seguro") && !value.includes("auto");
    },
  },
].sort((a,b)=>serviceOrder.indexOf(a.name)-serviceOrder.indexOf(b.name));
const serviceCatalog: Array<{name:string;icon:LucideIcon;tone:string;subtopics:string[]}> = [
  {name:"Assessoria Financeira",icon:ChartSpline,tone:"teal",subtopics:["Diagnóstico financeiro","Educação financeira","Organização de dívidas","Planejamento financeiro"]},
  {name:"CLT",icon:Briefcase,tone:"violet",subtopics:["Crédito do Trabalhador","Consignado privado","Contrato novo","Refinanciamento"]},
  {name:"Consignado",icon:Banknote,tone:"rose",subtopics:["Aumento de margem","Benefício INSS","Contrato novo","Portabilidade","Refinanciamento","Servidor público"]},
  {name:"Consórcio",icon:WalletCards,tone:"green",subtopics:["Eletroeletrônicos","Imóveis","Motocicletas","Serviços","Veículos leves","Veículos pesados"]},
  {name:"Crédito com garantia",icon:Landmark,tone:"blue",subtopics:["Garantia de imóvel","Garantia de veículo","Home equity","Refinanciamento de veículo"]},
  {name:"FGTS",icon:BadgeDollarSign,tone:"orange",subtopics:["Antecipação do saque-aniversário","Consulta de saldo","Quitação antecipada"]},
  {name:"INSS",icon:Banknote,tone:"violet",subtopics:["Aumento de margem","Benefício novo","Cartão consignado","Contrato novo","Portabilidade","Refinanciamento"]},
  {name:"Financiamento",icon:CarFront,tone:"gold",subtopics:["Financiamento de imóvel","Financiamento de motocicleta","Financiamento de veículo","Refinanciamento"]},
  {name:"Proteção Auto",icon:ShieldCheck,tone:"cyan",subtopics:["Assistência 24 horas","Proteção veicular","Rastreamento","Roubo, furto e colisão"]},
  {name:"Seguros",icon:Umbrella,tone:"teal",subtopics:["Seguro auto","Seguro empresarial","Seguro residencial","Seguro de vida","Seguro garantia","Seguro prestamista"]},
].sort((a,b)=>serviceOrder.indexOf(a.name)-serviceOrder.indexOf(b.name));
const distributionColors: Record<string, string> = {
  rose: "#b87870",
  gold: "#c9a35e",
  blue: "#7189a9",
  violet: "#9d79b9",
  cyan: "#6fa9b7",
  green: "#6da07f",
  orange: "#d19a53",
  teal: "#4f9b91",
};
const donutSlicePath = (start: number, end: number) => {
  const cx = 160,
    cy = 135,
    outerRadius = 110,
    innerRadius = 59,
    effectiveEnd = start + Math.min(end - start, 359.999),
    toPoint = (angle: number, x: number, y: number) => {
      const rad = (angle * Math.PI) / 180;
      return [cx + x * Math.cos(rad), cy + y * Math.sin(rad)];
    },
    outerStart = toPoint(start, outerRadius, outerRadius),
    outerEnd = toPoint(effectiveEnd, outerRadius, outerRadius),
    innerEnd = toPoint(effectiveEnd, innerRadius, innerRadius),
    innerStart = toPoint(start, innerRadius, innerRadius),
    large = effectiveEnd - start > 180 ? 1 : 0;
  return `M ${outerStart[0]} ${outerStart[1]} A ${outerRadius} ${outerRadius} 0 ${large} 1 ${outerEnd[0]} ${outerEnd[1]} L ${innerEnd[0]} ${innerEnd[1]} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${innerStart[0]} ${innerStart[1]} Z`;
};
const sliceLabelPoint = (start: number, end: number, radius = 84) => {
  const angle = ((start + end) / 2) * Math.PI / 180;
  return { x: 160 + radius * Math.cos(angle), y: 135 + radius * Math.sin(angle) };
};
const fmt = (v: string) => formatDateBr(v);
const productOptions = [
  "Consignado INSS",
  "Consignado Federal (SIAPE)",
  "Consignado Estadual",
  "Consignado Municipal",
  "Consignado CLT",
  "Consórcio",
  "Financiamento",
  "Crédito com garantia",
  "FGTS",
  "Proteção Auto",
  "Seguros",
  "Assessoria Financeira",
].sort((a, b) => a.length - b.length || a.localeCompare(b, "pt-BR"));
const agreementOptions=["INSS","CLT / Crédito do Trabalhador","Federal (SIAPE)","Estadual","Municipal","Veículo","Consórcio","FGTS","EVOGARD","Seguros","Assessoria Financeira"];
const contractTypeOptionsFor=(agreement:string)=>{
  const value=agreement.toLocaleLowerCase("pt-BR");
  if(value.includes("inss"))return ["Consignado INSS","Cartão consignado (RMC)","Cartão benefício (RCC)"];
  if(value.includes("clt")||value.includes("trabalhador"))return ["Consignado CLT / Crédito do Trabalhador"];
  if(value.includes("federal")||value.includes("siape"))return ["Consignado Federal (SIAPE)"];
  if(value.includes("estadual"))return ["Consignado Estadual"];
  if(value.includes("municipal"))return ["Consignado Municipal"];
  if(value.includes("consórcio"))return ["Consórcio"];
  if(value.includes("veículo"))return ["Financiamento","Crédito com garantia"];
  if(value.includes("fgts"))return ["FGTS"];
  if(value.includes("evogard"))return ["Proteção Auto"];
  if(value.includes("seguro"))return ["Seguros"];
  if(value.includes("assessoria"))return ["Assessoria Financeira"];
  return productOptions;
};
const finalOperationOptions = ["Adesão","Aumento de margem","Contrato novo","Financiamento","Margem livre","Portabilidade","Refinanciamento","Transferência de cota"];
const consignadoOperationOptions=["Contrato novo","Refinanciamento","Portabilidade","Refinanciamento da portabilidade","Saque-cartão","Cartão consignado (RMC)","Cartão benefício (RCC)","Saque complementar","Margem livre","Aumento de margem"];
const operationOptionsByProduct: Record<string,string[]> = {
  "Assessoria Financeira":["Diagnóstico financeiro","Educação financeira","Organização de dívidas","Planejamento financeiro"],
  "CLT":["Contrato novo","Refinanciamento","Portabilidade","Renegociação por portabilidade"],
  "Consignado":["Aumento de margem","Contrato novo","Margem livre","Novo INSS","Portabilidade","Refinanciamento","Servidor público"],
  "Consórcio":["Consórcio imobiliário","Consórcio de automóvel","Consórcio de motocicleta","Consórcio de embarcação","Consórcio de aeronave","Consórcio de máquinas e equipamentos","Consórcio de veículos pesados","Consórcio de outros bens móveis","Consórcio de serviços"],
  "Crédito com garantia":["Garantia de imóvel","Garantia de veículo","Home equity","Refinanciamento de veículo"],
  "FGTS":["Antecipação do saque-aniversário","Consulta de saldo","Quitação antecipada"],
  "INSS":["Aumento de margem","Benefício novo","Cartão consignado","Contrato novo","Margem livre","Portabilidade","Refinanciamento"],
  "Financiamento":["Financiamento","Crédito com garantia"],
  "Proteção Auto":["Proteção Auto"],
  "Seguros":["Seguro auto","Seguro empresarial","Seguro garantia","Seguro prestamista","Seguro residencial","Seguro de vida"],
};
const operationOptionsFor=(product:string)=>/^Consignado\b/i.test(product)||/cartão consignado|cartão benefício/i.test(product)?consignadoOperationOptions:operationOptionsByProduct[product]||finalOperationOptions;
const agreementForProduct=(product:string)=>/inss/i.test(product)?"INSS":/clt|trabalhador/i.test(product)?"CLT / Crédito do Trabalhador":/federal|siape/i.test(product)?"Federal (SIAPE)":/estadual/i.test(product)?"Estadual":/municipal/i.test(product)?"Municipal":/consórcio/i.test(product)?"Consórcio":/financiamento|garantia/i.test(product)?"Veículo":/fgts/i.test(product)?"FGTS":/proteção/i.test(product)?"EVOGARD":/seguro/i.test(product)?"Seguros":/assessoria/i.test(product)?"Assessoria Financeira":"";
const resolvedProduct=(details:Record<string,string>)=>details.contractType||(details.product==="__other"?details.productOther||"":details.product||"");
const operationValueForDetails=(details:Record<string,string>)=>{
  const product=resolvedProduct(details);
  if(/consórcio/i.test(product))return parseMoneyBr(details.value)||parseMoneyBr(details.quotaUnitValue)*Math.max(1,Number(details.quotaQuantity||1));
  return parseMoneyBr(details.value);
};
const finalBankOptions = [
  ...bankNames,
  "Banco do Brasil","Banco da Amazônia","Banco do Nordeste","Banestes","Santander","Banrisul","Banese","BRB","Banco Inter","Caixa Econômica Federal","Agibank","BTG Pactual","Banco Original","Bradesco","Nubank","PagBank","Banco BMG","Mercado Pago","QI Sociedade de Crédito","Banco Bari","C6 Bank","Itaú","PicPay","Banco Mercantil","Banco Safra","Omni Banco","Banco PAN","Banco Sofisa","Banco BV","Banco Daycoval","Citibank","Sicredi","Sicoob","Banco Ágil","Creditas","Facta Financeira","Lotus","Volkswagen Financial Services",
  "Allianz","Azul Seguros","Bradesco Seguros","HDI Seguros","Itaú Seguros","MAPFRE","Mitsui Sumitomo","Porto Seguro","Sompo Seguros","Suhai Seguradora","Tokio Marine","Zurich","Evogard",
  "Ademicon","Âncora Consórcios","BB Consórcios","Bradesco Consórcios","Caixa Consórcio","Canopus","Embracon","Honda Consórcios","Itaú Consórcios","Magalu Consórcios","MAPFRE Consórcios","Nacional Gazin","Porto Seguro Consórcio","Rodobens","Santander Consórcio","Servopa","Sicoob Consórcios","Sicredi Consórcios","Unifisa","Volkswagen Consórcio","Yamaha Consórcio",
];
const finalPromoterOptions = ["BEVI", "Solution"];
const menu: [View, LucideIcon, string][] = [
  ["inicio", House, "Início"],
  ["atendimento", Columns3, "Atendimento"],
  ["bancos", Landmark, "Bancos e financiamentos"],
  ["clientes", UsersRound, "Clientes"],
  ["financeiro", ChartNoAxesCombined, "Financeiro / Comissões"],
  ["notas", ReceiptText, "Notas fiscais"],
  ["parceiros", Handshake, "Parceiros"],
  ["producao", FileChartColumn, "Produção"],
  ["relatorios", ChartSpline, "Relatórios"],
  ["servicos", BriefcaseBusiness, "Serviços"],
  ["posvenda", MessageCircle, "Pós-venda"],
];

export default function Dashboard({
  user,
}: {
  user: DashboardUser;
}) {
  const [view, setView] = useState<View>("inicio"),
    [query, setQuery] = useState(""),
    [mobileMenu, setMobileMenu] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [selected, setSelected] = useState<Client | null>(null),
    [notice, setNotice] = useState(""),
    [deals, setDeals] = useState<Deal[]>([]),
    [liveClients, setLiveClients] = useState<Client[]>([]),
    [liveOps, setLiveOps] = useState<Operation[]>([]),
    [teamMembers,setTeamMembers]=useState<TeamMember[]>([]),
    [catalogOptions,setCatalogOptions]=useState<CatalogOption[]>([]),
    [postSales,setPostSales]=useState<PostSaleTask[]>([]),
    [googleReviewUrl,setGoogleReviewUrl]=useState(""),
    [receivables,setReceivables]=useState<Receivable[]>([]),
    [invoices,setInvoices]=useState<InvoiceRecord[]>([]),
    [partners,setPartners]=useState<PartnerRecord[]>([{id:0,name:"GG Veículos"}]),
    [productionPeriod,setProductionPeriod]=useState("2026-09"),
    [showReceivables,setShowReceivables]=useState(false),
    [dueReminderRequired,setDueReminderRequired]=useState(false),
    [dataRevision,setDataRevision]=useState(0),
    [newDealRequest,setNewDealRequest]=useState(0),
    [locked, setLocked] = useState(true),
    [gateReady, setGateReady] = useState(false),
    [visualTheme,setVisualTheme]=useState<"classic"|"mono">("classic");
  const refreshData = useCallback(() => { notifyCrmChanged(); setDataRevision((value) => value + 1); }, []);
  useEffect(() => {
    const refresh = () => setDataRevision(value => value + 1);
    const storage = (event: StorageEvent) => { if (event.key === CRM_STORAGE_KEY) refresh(); };
    window.addEventListener(CRM_CHANGED, refresh);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener(CRM_CHANGED, refresh); window.removeEventListener('storage', storage); };
  }, []);
  const dark = true;
  const toggleVisualTheme=()=>setVisualTheme(current=>{
    const next=current==="classic"?"mono":"classic";
    localStorage.setItem("tf_visual_theme",next);
    return next;
  });
  useEffect(() => {
    const forwarded = new WeakSet<Event>();
    const onClick = (e: Event) => {
      const t = e.target as HTMLElement;
      const footer = t.closest(
        ".tf-kanban article footer button",
      ) as HTMLButtonElement | null;
      const first = document.querySelector(
        ".tf-kanban article footer button",
      ) as HTMLButtonElement | null;
      if (
        footer &&
        first &&
        footer !== first &&
        !t.closest(".tf-upload-kanban") &&
        !forwarded.has(e)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
        forwarded.add(ev);
        first.dispatchEvent(ev);
      }
      if (t.closest(".tf-mobile-logo")) setView("inicio");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileMenu(false);
        setSettingsOpen(false);
        setSelected(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    setGateReady(true);
    setLocked(!user.serverAuthenticated && localStorage.getItem("tf_access_unlocked") !== "1");
    setVisualTheme(localStorage.getItem("tf_visual_theme")==="mono"?"mono":"classic");
    localStorage.setItem("tf_dark_mode", "1");
    const refreshApp=()=>navigator.serviceWorker?.getRegistration().then(async(registration)=>{
      await registration?.update();
      registration?.waiting?.postMessage({type:"SKIP_WAITING"});
    }).catch(()=>{});
    const reloadForUpdate=()=>window.location.reload();
    if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js?v=173",{updateViaCache:"none"}).then(async(registration)=>{
        await registration.update();
        registration.waiting?.postMessage({type:"SKIP_WAITING"});
      }).catch(() => {});
      document.addEventListener("visibilitychange",refreshApp);
      navigator.serviceWorker.addEventListener("controllerchange",reloadForUpdate);
    }
    let disposed=false;
    const controller=new AbortController();
    const readJson = async (url:string):Promise<any> => {
      const response = await fetch(`${url}${url.includes("?")?"&":"?"}_=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
        headers: { "cache-control": "no-cache" },
      });
      if (response.status === 401) {
        window.location.assign(`/signin-with-chatgpt?return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        return null;
      }
      if (!response.ok) throw new Error("Não foi possível atualizar os dados. Tente novamente.");
      return response.json();
    };
    const readCrm = async () => {
      const data:{clients:Client[];operations:Operation[];receivables:Receivable[]}={clients:[],operations:[],receivables:[]};
      let offset:number|null=0;
      do {
        const page=await readJson(`/api/crm/data?limit=1000&offset=${offset}`);
        if(!page)return null;
        data.clients.push(...page.clients);data.operations.push(...page.operations);data.receivables.push(...page.receivables);
        offset=page.nextOffset??null;
      } while(offset!==null);
      return data;
    };
    let loading=false;
    const load = async () => {
      if(loading)return;loading=true;
      const [dealsData,crmData,teamData,partnerData,invoiceData,catalogData,postSaleData]=await Promise.all([
        (user.role==="admin"||user.permissions.includes("atendimento"))?readJson("/api/deals"):Promise.resolve(null),readCrm(),user.role==="admin"?readJson("/api/access-users"):Promise.resolve(null),(user.role==="admin"||user.permissions.includes("parceiros"))?readJson("/api/partners"):Promise.resolve(null),(user.role==="admin"||user.permissions.includes("notas"))?readJson("/api/invoices"):Promise.resolve(null),(user.role==="admin"||user.permissions.includes("atendimento"))?readJson("/api/catalog-options"):Promise.resolve(null),(user.role==="admin"||user.permissions.includes("posvenda"))?readJson("/api/post-sales"):Promise.resolve(null),
      ]).catch(()=>{if(!disposed)setNotice("Falha ao carregar os dados. Verifique sua conexão e tente novamente.");return [null,null,null,null,null,null,null]});
      if(disposed)return;
      if(dealsData?.deals)setDeals(dealsData.deals);
      const x=crmData;
      if(x){
          if (x?.clients)
            setLiveClients(
              x.clients.map((c: Client) => ({
                ...c,
                cpf: formatCpf(c.cpf),
                phone: formatPhone(c.phone),
              })),
            );
          if (x?.operations) setLiveOps(x.operations);
          if (x?.receivables) setReceivables(x.receivables);
      }
      if(teamData?.members)setTeamMembers(teamData.members);
      if(partnerData?.partners){const loaded=partnerData.partners as PartnerRecord[];setPartners(loaded.some(partner=>partner.name.localeCompare("GG Veículos","pt-BR",{sensitivity:"base"})===0)?loaded:[{id:0,name:"GG Veículos",taxRate:0,invoiceRate:0,tfShare:50},...loaded]);}
      if(invoiceData?.invoices)setInvoices(invoiceData.invoices);
      if(catalogData?.options)setCatalogOptions(catalogData.options);
      if(postSaleData?.tasks)setPostSales(postSaleData.tasks);
      if(postSaleData?.googleReviewUrl!==undefined)setGoogleReviewUrl(postSaleData.googleReviewUrl);
      loading=false;
    };
    load();
    const timer = window.setInterval(load, 30000);
    const refreshOnFocus=()=>load();window.addEventListener('focus',refreshOnFocus);
    return () => {
      disposed=true;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange",refreshApp);
      navigator.serviceWorker?.removeEventListener("controllerchange",reloadForUpdate);
      window.removeEventListener('focus',refreshOnFocus);
    };
  }, [user.role,user.permissions,user.serverAuthenticated,dataRevision]);
  const allClients = liveClients;
  const allOps = useMemo(() => liveOps.map(operation => /proteção auto/i.test(operation.product) && operation.installment > 0 ? {...operation, value:operation.installment} : operation), [liveOps]);
  const currentPeriod=(()=>{const date=new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,7)})();
  const currentMonthOps = allOps.filter((o) => o.date.startsWith(currentPeriod));
  const total = currentMonthOps.reduce((s, o) => s + o.value, 0),
    commission = currentMonthOps.reduce((s, o) => s + o.commission, 0);
  const todayDate=(()=>{const date=new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10)})();
  const dueReceivables=useMemo(()=>receivables.filter(item=>item.dueDate&&item.dueDate<=todayDate),[receivables,todayDate]);
  const displayedReceivables=dueReminderRequired?dueReceivables:receivables;
  useEffect(()=>{if(!locked&&dueReceivables.length&&localStorage.getItem(`tf_receivables_seen_${todayDate}`)!=="1"){setDueReminderRequired(true);setShowReceivables(true)}},[locked,dueReceivables.length,todayDate]);
  useEffect(()=>{if(dueReminderRequired&&!dueReceivables.length){setDueReminderRequired(false);setShowReceivables(false)}},[dueReminderRequired,dueReceivables.length]);
  const found = useMemo(
    () =>
      allClients.filter(
        (c) =>
          !query ||
          `${c.name} ${c.cpf} ${c.benefit} ${c.phone}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [query, allClients],
  );
  const flash = (s: string) => {
    setNotice(s);
    setTimeout(() => setNotice(""), 2200);
  };
  const markCommissionReceived=async(id:number)=>{const response=await fetch('/api/records',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({entity:'commission',id,details:{status:'recebida'}})});if(response.ok){setReceivables(current=>current.filter(item=>item.id!==id));refreshData();flash('Crédito marcado como recebido')}else{const data=await response.json().catch(()=>({}));alert(data.error||'Não foi possível atualizar o crédito.')}};
  const can=(section:View)=>user.role==="admin"||user.permissions.includes(section);
  useEffect(()=>{if(!can(view))setView('inicio')},[view,user.permissions]);
  if (!gateReady) return <main className="tf-gate-loading" />;
  if (locked)
    return (
      <AccessGate
        unlock={() => {
          localStorage.setItem("tf_access_unlocked", "1");
          setLocked(false);
        }}
      />
    );
  return (
    <main
      className={`tf-app ${dark ? "dark" : "light"} theme-${visualTheme}${mobileMenu ? " menu-open" : ""}`}
    >
      <aside className="tf-side" aria-label="Menu principal" id="tf-navigation">
        <div className="tf-brand">
          <button
            type="button"
            className="tf-brand-home"
            aria-label="Ir para o início"
            onClick={() => {
              setView("inicio");
              setMobileMenu(false);
            }}
          >
            <img className="tf-brand-emblem" src="/tf-emblem.png" alt="TF" />
            <img
              className="tf-brand-full"
              src="/tf-logo-no-bg.png"
              alt="TF Assessoria e Finanças"
            />
            <span>ASSESSORIA E FINANÇAS</span>
          </button>
          <button
            type="button"
            className="tf-menu-close"
            aria-label="Fechar menu"
            onClick={() => setMobileMenu(false)}
          >
            <X />
          </button>
        </div>
        <nav>
          {menu.filter(([id])=>can(id)).map(([id, MenuIcon, label]) => (
            <button
              type="button"
              aria-label={label}
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => {
                setView(id);
                setMobileMenu(false);
              }}
            >
              <i>
                <MenuIcon />
              </i>
              <span>{label}</span>
              {id === "clientes" && <b>{allClients.length}</b>}
              {id === "posvenda" && postSales.filter((task) => task.status === "pendente").length > 0 && <b className="tf-menu-alert-count">{postSales.filter((task) => task.status === "pendente").length}</b>}
            </button>
          ))}
          {user.role==="admin"&&<button
            type="button"
            aria-label="Usuários e acessos"
            className={view==="usuarios"?"active":""}
            onClick={()=>{setView("usuarios");setMobileMenu(false)}}
          ><i><UserRoundCog/></i><span>Usuários e acessos</span><b>{teamMembers.filter(m=>m.active).length}</b></button>}
          <button
            type="button"
            aria-label={visualTheme==="mono"?"Usar tema original":"Usar tema Preto Luxo"}
            className={visualTheme==="mono"?"active":""}
            onClick={()=>{toggleVisualTheme();setMobileMenu(false)}}
          ><i><Palette/></i><span>{visualTheme==="mono"?"Tema original":"Tema Preto Luxo"}</span></button>
        </nav>
        <div className="tf-user">
          <i>TO</i>
          <span>
            <b>{user.name}</b>
            <small>{user.role==="admin"?"Administrador":"Funcionário"}</small>
          </span>
          <a href="/signout-with-chatgpt?return_to=/">
            <ArrowUpRight />
          </a>
        </div>
      </aside>
      <section className="tf-main">
        <header className="tf-top">
          <button
            className="tf-mobile-menu"
            aria-label={mobileMenu?"Recolher menu":"Abrir menu"} aria-expanded={mobileMenu} aria-controls="tf-navigation"
            onClick={() => setMobileMenu(open => !open)}
          >
            <Menu />
          </button>
          <button
            type="button"
            className="tf-mobile-logo-button"
            aria-label="Ir para o início"
            onClick={() => setView("inicio")}
          >
            <img className="tf-mobile-logo" src="/tf-emblem.png" alt="TF" />
          </button>
          <label>
            <Search />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou CPF"
            />
          </label>
          <div>
            {receivables.length>0&&<button className="tf-receivable-trigger" aria-label={`${receivables.length} comissões e taxas a receber`} title="Comissões a receber" onClick={()=>{setDueReminderRequired(false);setShowReceivables(true)}}><BadgeDollarSign/><span>Comissões a receber</span><b>{receivables.length}</b></button>}
            <button className="tf-notifications-trigger" aria-label="Notificações">
              <Bell />
              <b>3</b>
            </button>
            {user.role==="admin"&&<button className={`tf-top-settings${settingsOpen ? " active" : ""}`} aria-label="Configurações" title="Configurações" onClick={()=>setSettingsOpen(true)}><SettingsIcon/></button>}
            <button className="tf-logout" aria-label="Sair e bloquear o sistema" title="Sair" onClick={()=>{localStorage.removeItem("tf_access_unlocked");if(user.serverAuthenticated)window.location.assign("/signout-with-chatgpt");else setLocked(true)}}><LogOut/></button>
            <button
              className="tf-primary tf-main-action"
              onClick={() => {setView("atendimento");setNewDealRequest(value=>value+1)}}
            >
              <Plus /> Novo cliente
            </button>
          </div>
        </header>
        <div className="tf-mobile-heading">
          <strong>Gestão TF</strong>
          <button type="button" onClick={() => {setView("atendimento");setNewDealRequest(value=>value+1)}}>
            <Plus aria-hidden="true" /> Novo cliente
          </button>
        </div>
        <div className="tf-content">
          {view === "inicio" && (
            <Home
              go={setView}
              openMonth={(period)=>{setProductionPeriod(period);setView("producao")}}
              clientCount={allClients.length}
              operationCount={allOps.length}
              monthRows={currentMonthOps}
              allRows={allOps}
              monthPeriod={currentPeriod}
              activeDealCount={deals.filter(deal=>deal.stage!=="finalizado").length}
            />
          )}{" "}
          {view === "clientes" && (
            <ClientsFiltered data={found} operations={allOps} open={setSelected} />
          )}{" "}
          {view === "atendimento" && (
            <Kanban deals={deals} setDeals={setDeals} user={user} members={teamMembers} partnerNames={partners.map(partner=>partner.name)} receivables={receivables} catalogOptions={catalogOptions} onCatalogChange={(option)=>setCatalogOptions(current=>option.label?[option,...current.filter(item=>item.id!==option.id)]:current.filter(item=>item.id!==option.id))} newDealRequest={newDealRequest} onMarkReceived={markCommissionReceived} onReceivableCreated={(item)=>setReceivables(items=>[item,...items.filter(existing=>existing.id!==item.id)])} onDataChanged={refreshData} />
          )}{" "}
          {view === "producao" && (
            <Production rows={allOps} clientsData={allClients} initialPeriod={productionPeriod} openClient={setSelected} />
          )}{" "}
          {view === "parceiros" && <Partners rows={allOps} clientsData={allClients} partners={partners} onPartnerCreated={(partner)=>setPartners(current=>current.some(item=>item.name.localeCompare(partner.name,"pt-BR",{sensitivity:"base"})===0)?current:[...current,partner].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR",{sensitivity:"base"})))} onPartnerUpdated={(partner)=>{setPartners(current=>{const withoutPlaceholder=current.filter(item=>!(item.id===0&&item.name.localeCompare(partner.name,"pt-BR",{sensitivity:"base"})===0));return withoutPlaceholder.some(item=>item.id===partner.id)?withoutPlaceholder.map(item=>item.id===partner.id?partner:item):[...withoutPlaceholder,partner]});refreshData()}} />} {" "}
          {view === "servicos" && <Services rows={allOps} />}{" "}
          {view === "comissoes" && (
            <Commissions total={commission} rows={currentMonthOps} clientsData={allClients} />
          )}{" "}
          {view === "financeiro" && (
            <Finance rows={allOps} />
          )}{" "}
          {view === "notas" && <Invoices invoices={invoices} />} {view === "bancos" && <Banks />}{" "}
          {view === "relatorios" && (
            <ReportsFiltered rows={allOps} clientsData={allClients} />
          )}{" "}
          {view === "posvenda" && <PostSales tasks={postSales} setTasks={setPostSales} googleReviewUrl={googleReviewUrl} />}
          {view==="usuarios"&&user.role==="admin"&&<AccessManagement members={teamMembers} setMembers={setTeamMembers} partners={partners}/>} {" "}
        </div>
      </section>
      {settingsOpen && <SettingsPanel close={() => setSettingsOpen(false)} serverAuthenticated={user.serverAuthenticated} />}{" "}
      {showReceivables&&<div className={`tf-modal-back${dueReminderRequired?" tf-receivable-blocking":""}`}><section className="tf-modal tf-receivables-modal">{!dueReminderRequired&&<button type="button" className="tf-modal-close" onClick={()=>setShowReceivables(false)}>×</button>}<small>FINANCEIRO</small><h2>{dueReminderRequired?"Você tem comissões a receber":"Comissões a receber"}</h2><p>{dueReminderRequired?"Confira quem deve pagar hoje ou possui pagamento atrasado.":"Valores previstos de comissões, taxas de adesão e assessorias."}</p><div>{displayedReceivables.map(item=><article key={item.id}><i><BadgeDollarSign/></i><span><b>{item.name}</b><small>{item.product} · {item.type}</small></span><strong>{brl(item.value)}</strong><time className={item.dueDate&&item.dueDate<todayDate?"overdue":""}>{item.dueDate?formatDateBr(item.dueDate):"Sem data"}</time><button type="button" onClick={()=>markCommissionReceived(item.id)}>Marcar recebido</button></article>)}</div>{dueReminderRequired&&<button type="button" className="tf-primary tf-receivable-ack" onClick={()=>{localStorage.setItem(`tf_receivables_seen_${todayDate}`,"1");setDueReminderRequired(false);setShowReceivables(false)}}>Visualizei os recebimentos</button>}</section></div>}{" "}
      {selected && <ClientSheet client={allClients.find(client=>client.id===selected.id)||selected} operations={allOps} close={() => setSelected(null)} refresh={()=>{setSelected(null);refreshData()}} />}{" "}
      {notice && <div className="tf-toast">✓ {notice}</div>}
    </main>
  );
}

function AccessGate({ unlock }: { unlock: () => void }) {
  const [cpf, setCpf] = useState(""),
    [password, setPassword] = useState(""),
    [hasAccess, setHasAccess] = useState(false),
    [error, setError] = useState("");
  useEffect(
    () =>
      setHasAccess(
        Boolean(
          localStorage.getItem("tf_access_password") &&
            localStorage.getItem("tf_access_cpf"),
        ),
      ),
    [],
  );
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = cpf.replace(/\D/g, ""),
      savedCpf = localStorage.getItem("tf_access_cpf"),
      savedPassword = localStorage.getItem("tf_access_password");
    if (clean.length !== 11) {
      setError("Digite um CPF com 11 números.");
      return;
    }
    if (password.length < 4) {
      setError("Digite sua senha com pelo menos 4 caracteres.");
      return;
    }
    if (!hasAccess) {
      localStorage.setItem("tf_access_cpf", clean);
      localStorage.setItem("tf_access_password", password);
      unlock();
      return;
    }
    if (clean === savedCpf && password === savedPassword) unlock();
    else setError("CPF ou senha incorretos.");
  };
  const forgot = () => {
    if (window.confirm("Deseja redefinir o acesso deste computador?")) {
      localStorage.removeItem("tf_access_cpf");
      localStorage.removeItem("tf_access_password");
      setCpf("");
      setPassword("");
      setHasAccess(false);
      setError("Digite seu CPF e crie uma nova senha.");
    }
  };
  return (
    <main className="tf-gate">
      <div className="tf-gate-card">
        <div className="tf-gate-brand" aria-label="TF Assessoria e Finanças">
          <img src="/tf-emblem.png" alt="TF" />
          <strong>Assessoria &amp; Finanças</strong>
        </div>
        <small>ASSESSORIA E FINANÇAS</small>
        <h1>Gestão</h1>
        <p>
          {hasAccess
            ? "Informe seus dados para acessar o sistema."
            : "Cadastre seu CPF e uma senha para este acesso."}
        </p>
        <form onSubmit={submit}>
          <label>
            CPF
            <input
              autoFocus
              inputMode="numeric"
              autoComplete="username"
              value={cpf}
              onChange={(e) => setCpf(maskCpf(e.target.value))}
              placeholder="000.000.000-00"
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              autoComplete={hasAccess ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
            />
          </label>
          {error && <em>{error}</em>}
          <button type="submit" className="tf-primary">
            Entrar
          </button>
          {hasAccess && (
            <button type="button" className="tf-forgot" onClick={forgot}>
              Esqueci minha senha
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
function Title({
  over,
  title,
  text,
  action,
  onAction,
}: {
  over: string;
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="tf-title">
      <div>
        <small>{over}</small>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {title === "Atendimento" && <QuickDocumentUploadInStage />}
      {action && (
        <button className="tf-primary" onClick={onAction}>
          ＋ {action}
        </button>
      )}
    </div>
  );
}
function Metric({
  icon,
  label,
  value,
  note,
}: {
  icon: string;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="tf-metric">
      <i>{icon}</i>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{note}</em>
      </span>
    </article>
  );
}
function PanelTitle({
  over,
  title,
  action,
  onAction,
}: {
  over: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <header className="tf-panel-title">
      <div>
        <small>{over}</small>
        <h2>{title}</h2>
      </div>
      {action && (
        <button type="button" onClick={onAction}>
          {action} →
        </button>
      )}
    </header>
  );
}
function ClientsFiltered({
  data,
  operations,
  open,
}: {
  data: Client[];
  operations: Operation[];
  open: (c: Client) => void;
}) {
  const [filter, setFilter] = useState<"all" | "month" | "active" | "inactive">("all");
  const rows = (
    filter === "all"
      ? data
      : filter === "month"
        ? data.filter((c) => operations.some((o) => o.clientId === c.id && o.date.startsWith("2026-09")))
      : filter === "active"
        ? data.filter((c) => operations.some((o) => o.clientId === c.id))
        : data.filter((c) => !operations.some((o) => o.clientId === c.id))
  ).slice().sort((a,b)=>a.name.localeCompare(b.name,"pt-BR",{sensitivity:"base"}));
  return (
    <>
      <Title
        over="BASE ÚNICA DE CLIENTES"
        title="Clientes"
        text="Um cadastro por pessoa, com todo o histórico preservado."
        action="Cadastrar cliente"
      />
      <div className="tf-filters">
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          Todos <b>{data.length}</b>
        </button>
        <button
          className={filter === "month" ? "active" : ""}
          onClick={() => setFilter("month")}
        >
          Clientes de setembro
        </button>
        <button
          className={filter === "active" ? "active" : ""}
          onClick={() => setFilter("active")}
        >
          Com operação ativa
        </button>
        <button
          className={filter === "inactive" ? "active" : ""}
          onClick={() => setFilter("inactive")}
        >
          Sem movimentação
        </button>
        <span />
        <button onClick={() => setFilter("all")}>⚙ Filtros</button>
        <button
          onClick={() =>
            alert("Use o atendimento para cadastrar uma nova operação.")
          }
        >
          ⇧ Importar planilhas
        </button>
      </div>
      <div className="tf-client-list">
        <div className="tf-list-head">
          <span>CLIENTE</span>
          <span>CONTATO</span>
          <span>BENEFÍCIO</span>
          <span>PARCEIRO</span>
          <span>OPERAÇÕES</span>
          <span>ÚLTIMA OPERAÇÃO</span>
          <span />
        </div>
        {rows.map((c) => {
          const co = operations.filter((o) => o.clientId === c.id);
          return (
            <button
              className="tf-client-row"
              key={c.id}
              onClick={() => open(c)}
            >
              <span className="tf-client-name">
                <i>
                  {c.name
                    .split(" ")
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join("")}
                </i>
                <b>
                  {c.name}
                  <small>{formatCpf(c.cpf)}</small>
                </b>
              </span>
              <span>
                {formatPhone(c.phone)}
                <small>{c.city}</small>
              </span>
              <span>{c.benefit}</span>
              <span>{Array.from(new Set(co.map(operation=>operation.origin).filter(origin=>origin&&origin!=="Balcão"))).join(", ")||"Sem parceiro"}</span>
              <strong>{co.length}</strong>
              <span>
                {co[0] ? fmt(co[0].date) : "—"}
                <small>{co[0]?.product}</small>
              </span>
              <em>›</em>
            </button>
          );
        })}
      </div>
    </>
  );
}
function Home({
  go,
  openMonth,
  clientCount,
  operationCount,
  monthRows,
  allRows,
  monthPeriod,
  activeDealCount,
}: {
  go: (v: View) => void;
  openMonth: (period:string) => void;
  clientCount: number;
  operationCount: number;
  monthRows: Operation[];
  allRows: Operation[];
  monthPeriod: string;
  activeDealCount: number;
}) {
  const [selectedDistribution, setSelectedDistribution] = useState<string | null>(null);
  const [hoveredDistribution, setHoveredDistribution] = useState<string | null>(null);
  const [hoveredComparisonIndex, setHoveredComparisonIndex] = useState<number | null>(null);
  const [previousPeriod, setPreviousPeriod] = useState("2026-08");
  const [currentPeriod, setCurrentPeriod] = useState("2026-09");
  const comparisonMonths = [
    ["01", "Janeiro"], ["02", "Fevereiro"], ["03", "Março"], ["04", "Abril"],
    ["05", "Maio"], ["06", "Junho"], ["07", "Julho"], ["08", "Agosto"],
    ["09", "Setembro"], ["10", "Outubro"], ["11", "Novembro"], ["12", "Dezembro"],
  ];
  const comparisonYears = Array.from({ length: 8 }, (_, index) => String(2023 + index));
  const groups = serviceCatalog.map(service=>{const matched=monthRows.filter(operation=>productionProducts.find(product=>product.name===service.name)?.match(operation.product)),used=Array.from(new Set(matched.map(operation=>operation.operationType||operation.product))).slice(0,2);return {name:service.name,tone:service.tone,items:(used.length?used:service.subtopics.slice(0,2)).map(topic=>[topic,used.length?`${matched.filter(operation=>(operation.operationType||operation.product)===topic).length} registrada(s)`:"Sem movimentação"] as [string,string])}}),
    monthTotal = monthRows.reduce((s, o) => s + o.value, 0),
    monthCommission = monthRows.reduce((s, o) => s + o.commission, 0),
    monthCommissionPaid = monthRows.reduce((s,o)=>s+o.commissionReceived,0),
    monthCommissionPending = monthRows.reduce((s,o)=>s+o.commissionPending,0),
    monthClients = new Set(monthRows.map((o) => o.clientId)).size,
    groupTotals = groups.map((g) => ({
      name: g.name,
      value: monthRows
        .filter((o) => productionProducts.find(product=>product.name===g.name)?.match(o.product))
        .reduce((s, o) => s + o.value, 0),
      commission: monthRows
        .filter((o) => productionProducts.find(product=>product.name===g.name)?.match(o.product))
        .reduce((s, o) => s + o.commission, 0),
    })),
    groupSum = Math.max(
      groupTotals.reduce((s, g) => s + g.value, 0),
      1,
    ),
    productTotals = productionProducts.map((g) => ({
      name: g.name,
      tone: g.tone,
      value: monthRows
        .filter((o) => g.match(o.product))
        .reduce((s, o) => s + o.value, 0),
      count: monthRows.filter((o) => g.match(o.product)).length,
    })),
    productSum = Math.max(
      productTotals.reduce((s, g) => s + g.value, 0),
      1,
    ),
    distribution = productTotals.map((g, i) => ({
      name: g.name,
      tone: g.tone,
      value: g.value,
      count: g.count,
      percent:
        i === productTotals.length - 1
          ? Math.max(
              0,
              100 -
                productTotals
                  .slice(0, i)
                  .reduce(
                    (s, x) => s + Math.round((x.value / productSum) * 100),
                    0,
                  ),
            )
        : Math.round((g.value / productSum) * 100),
    }));
  const selectedSlice = selectedDistribution
    ? distribution.find((item) => item.name === selectedDistribution) || null
    : null;
  const activeSlice = hoveredDistribution
    ? distribution.find((item) => item.name === hoveredDistribution) || selectedSlice
    : selectedSlice;
  const monthReference = new Date(`${monthPeriod}-01T00:00:00Z`);
  monthReference.setUTCMonth(monthReference.getUTCMonth() - 1);
  const priorMonthPeriod = monthReference.toISOString().slice(0, 7);
  const priorMonthTotal = allRows.filter((operation) => operation.date.startsWith(priorMonthPeriod)).reduce((sum, operation) => sum + operation.value, 0);
  const monthDelta = priorMonthTotal > 0 ? ((monthTotal - priorMonthTotal) / priorMonthTotal) * 100 : null;
  const previousMonthRows = allRows.filter((o) => o.date.startsWith(previousPeriod));
  const currentMonthRows = allRows.filter((o) => o.date.startsWith(currentPeriod));
  const periodLabel = (period: string) => {
    if (!period) return "Período";
    const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-01T00:00:00Z`));
    return label.charAt(0).toUpperCase() + label.slice(1);
  };
  const monthLabel = (period: string) => comparisonMonths.find(([value]) => value === period.slice(5))?.[1] || "Período";
  const comparisonProducts = productionProducts
    .map((product) => ({
      ...product,
      current: currentMonthRows.filter((o) => product.match(o.product)).reduce((sum, o) => sum + o.value, 0),
      previous: previousMonthRows.filter((o) => product.match(o.product)).reduce((sum, o) => sum + o.value, 0),
    }))
    .filter((product) => product.current > 0 || product.previous > 0);
  const currentProduction = currentMonthRows.reduce((sum, o) => sum + o.value, 0);
  const previousProduction = previousMonthRows.reduce((sum, o) => sum + o.value, 0);
  const chartMax = Math.max(1, ...comparisonProducts.flatMap((product) => [product.current, product.previous]));
  const comparisonPoint = (value: number, index: number) => {
    const x = comparisonProducts.length === 1 ? 50 : (index / Math.max(1, comparisonProducts.length - 1)) * 100;
    const y = 86 - (value / chartMax) * 68;
    return { x, y };
  };
  const currentPoints = comparisonProducts.map((product, index) => comparisonPoint(product.current, index));
  const previousPoints = comparisonProducts.map((product, index) => comparisonPoint(product.previous, index));
  const linePath = (points: { x: number; y: number }[]) => points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const areaPath = (points: { x: number; y: number }[]) => points.length ? `${linePath(points)} L ${points.at(-1)!.x} 90 L ${points[0].x} 90 Z` : "";
  return (
    <>
      <section className="tf-command-hero">
        <div className="tf-command-copy">
          <small>PAINEL EXECUTIVO · {periodLabel(monthPeriod).toUpperCase()}</small>
          <h1>Gestão TF</h1>
          <p>
            Atendimentos, produção e resultados organizados em uma única visão.
          </p>
        </div>
      </section>
      <section className="tf-kpi-strip">
        <article className="tf-kpi-navigate">
          <button type="button" onClick={()=>openMonth(monthPeriod)} aria-label={`Ver os ${monthClients} clientes do mês`}>
            <small>CLIENTES DO MÊS</small>
            <strong>{monthClients}</strong>
            <span>Base histórica: {clientCount.toLocaleString("pt-BR")}</span>
            <em>Ver clientes do mês →</em>
          </button>
        </article>
        <article>
          <small>PRODUÇÃO</small>
          <strong>{brl(monthTotal)}</strong>
          <span>{monthRows.length} operações em {periodLabel(monthPeriod)}</span>
        </article>
        <article>
          <small>COMISSÕES</small>
          <strong>{brl(monthCommission)}</strong>
          <span>Pagas {brl(monthCommissionPaid)} · A receber {brl(monthCommissionPending)}</span>
        </article>
        <article>
          <small>EM ANDAMENTO</small>
          <strong>{activeDealCount}</strong>
          <span>Novos atendimentos</span>
        </article>
      </section>
      <section className="tf-executive-chart tf-month-comparison">
        <header className="tf-comparison-header">
          <div>
            <small>PRODUÇÃO COMPARATIVA</small>
            <h2>{monthLabel(previousPeriod)} <span className="tf-versus">versus</span> {monthLabel(currentPeriod)}</h2>
            <p>Compare a produção dos períodos escolhidos por produto.</p>
          </div>
          <div className="tf-comparison-total">
            <span className="period-one"><div className="tf-period-picker"><CalendarDays aria-hidden="true"/><div className="tf-period-selectors"><select aria-label="Mês do primeiro período" value={previousPeriod.slice(5)} onChange={(e)=>setPreviousPeriod(`${previousPeriod.slice(0,4)}-${e.target.value}`)}>{comparisonMonths.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><select aria-label="Ano do primeiro período" value={previousPeriod.slice(0,4)} onChange={(e)=>setPreviousPeriod(`${e.target.value}-${previousPeriod.slice(5)}`)}>{comparisonYears.map((year)=><option key={year}>{year}</option>)}</select></div></div><strong>{brl(previousProduction)}</strong></span>
            <span className="period-two"><div className="tf-period-picker"><CalendarDays aria-hidden="true"/><div className="tf-period-selectors"><select aria-label="Mês do segundo período" value={currentPeriod.slice(5)} onChange={(e)=>setCurrentPeriod(`${currentPeriod.slice(0,4)}-${e.target.value}`)}>{comparisonMonths.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><select aria-label="Ano do segundo período" value={currentPeriod.slice(0,4)} onChange={(e)=>setCurrentPeriod(`${e.target.value}-${currentPeriod.slice(5)}`)}>{comparisonYears.map((year)=><option key={year}>{year}</option>)}</select></div></div><strong>{brl(currentProduction)}</strong></span>
          </div>
        </header>
        <div className="tf-comparison-legend">
          <span><i className="previous" /> {monthLabel(previousPeriod)}</span>
          <span><i className="current" /> {monthLabel(currentPeriod)}</span>
        </div>
        <div className="tf-comparison-chart">
          {comparisonProducts.length ? <>
            <svg className="tf-comparison-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`Comparativo da produção de ${periodLabel(previousPeriod)} e ${periodLabel(currentPeriod)} por produto`}>
              <defs>
                <linearGradient id="tf-current-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e7bd68" stopOpacity=".46"/><stop offset="1" stopColor="#e7bd68" stopOpacity="0"/></linearGradient>
                <linearGradient id="tf-previous-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#55d6a2" stopOpacity=".34"/><stop offset="1" stopColor="#55d6a2" stopOpacity="0"/></linearGradient>
                <filter id="tf-line-glow"><feGaussianBlur stdDeviation="1.25" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              </defs>
              <path className="tf-comparison-area previous" d={areaPath(previousPoints)} />
              <path className="tf-comparison-area current" d={areaPath(currentPoints)} />
              <path className="tf-comparison-line previous" d={linePath(previousPoints)} />
              <path className="tf-comparison-line current" d={linePath(currentPoints)} />
              {comparisonProducts.map((product, index) => <g key={product.name}>
                <circle className="tf-comparison-dot previous" cx={previousPoints[index].x} cy={previousPoints[index].y} r={hoveredComparisonIndex === index ? 2.1 : 1.35}/>
                <circle className="tf-comparison-dot current" cx={currentPoints[index].x} cy={currentPoints[index].y} r={hoveredComparisonIndex === index ? 2.1 : 1.35}/>
              </g>)}
            </svg>
            <div className="tf-comparison-hit-grid">
              {comparisonProducts.map((product, index) => <button key={product.name} type="button" onMouseEnter={() => setHoveredComparisonIndex(index)} onMouseLeave={() => setHoveredComparisonIndex(null)} onFocus={() => setHoveredComparisonIndex(index)} onBlur={() => setHoveredComparisonIndex(null)} aria-label={`${product.name}: ${periodLabel(previousPeriod)} ${brl(product.previous)}, ${periodLabel(currentPeriod)} ${brl(product.current)}`}>
                {hoveredComparisonIndex === index && <span className="tf-comparison-tooltip"><b>{product.name}</b><em>{monthLabel(previousPeriod)} <strong>{brl(product.previous)}</strong></em><em>{monthLabel(currentPeriod)} <strong>{brl(product.current)}</strong></em></span>}
                <span>{product.name}</span>
              </button>)}
            </div>
          </> : <div className="tf-comparison-empty">Cadastre operações para visualizar o comparativo.</div>}
        </div>
      </section>
      <div className="tf-overview-layout">
        <section className="tf-operation-board">
          <header>
            <div>
              <small>OPERAÇÕES E SERVIÇOS</small>
              <h2>Visão por categoria</h2>
            </div>
            <button onClick={() => go("producao")}>
              Ver produção completa →
            </button>
          </header>
          <div className="tf-board-labels">
            <span>Categoria</span>
            <span>Serviço</span>
            <span>Produção</span>
            <span>Comissão</span>
          </div>
          {groups.map((group) => (
            <article
              className={`tf-service-band ${group.tone}`}
              key={group.name}
            >
              <strong>{group.name}</strong>
              <div>
                {group.items.map((item) => (
                  <span key={item[0]}>
                    <b>{item[0]}</b>
                    <small>{item[1]}</small>
                  </span>
                ))}
              </div>
              <div className="tf-band-values">
                <span>
                  <b>
                    {brl(
                      groupTotals.find((g) => g.name === group.name)?.value ||
                        0,
                    )}
                  </b>
                  <small>Produzido</small>
                </span>
                <span>
                  <b>
                    {brl(
                      groupTotals.find((g) => g.name === group.name)
                        ?.commission || 0,
                    )}
                  </b>
                  <small>Comissão</small>
                </span>
              </div>
            </article>
          ))}
          <footer>
            <span>
              <b>{operationCount.toLocaleString("pt-BR")}</b>
              <small>operações no histórico</small>
            </span>
            <button onClick={() => go("clientes")}>
              Pesquisar base de clientes
            </button>
          </footer>
        </section>
        <aside className="tf-insight-column">
          <section className="tf-result-card">
            <header>
              <div>
                <small>RESULTADO DO MÊS</small>
                <h2>Distribuição da produção</h2>
              </div>
              <button onClick={() => go("relatorios")}>Relatório</button>
            </header>
            <div
              className="tf-premium-donut"
              role="img"
              aria-label="Distribuição percentual da produção"
            >
              <svg className="tf-pie-svg" viewBox="0 0 320 290" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                <defs>
                  {Object.entries(distributionColors).map(([tone, color]) => (
                    <linearGradient key={tone} id={`tf-gradient-${tone}`} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor={color} />
                      <stop offset="0.48" stopColor={color} stopOpacity="0.96" />
                      <stop offset="1" stopColor="#171713" stopOpacity="0.78" />
                    </linearGradient>
                  ))}
                  <radialGradient id="tf-chart-core" cx="38%" cy="28%" r="78%">
                    <stop offset="0" stopColor="#2b2519" />
                    <stop offset="0.52" stopColor="#11120f" />
                    <stop offset="1" stopColor="#050605" />
                  </radialGradient>
                </defs>
                <ellipse className="tf-pie-shadow" cx="160" cy="260" rx="104" ry="13" />
                <g className="tf-pie-depth">
                  {distribution.map((item, index) => {
                    const start = -90 + distribution.slice(0, index).reduce((sum, x) => sum + x.percent * 3.6, 0);
                    const end = start + item.percent * 3.6;
                    return item.percent > 0 ? (
                      <path key={`depth-${item.name}`} d={donutSlicePath(start, end)} fill={distributionColors[item.tone] || "#c9a35e"} />
                    ) : null;
                  })}
                </g>
                {distribution.map((item, index) => {
                  const start = -90 + distribution.slice(0, index).reduce((sum, x) => sum + x.percent * 3.6, 0);
                  const end = start + item.percent * 3.6;
                  return item.percent > 0 ? (
                    <path
                      key={item.name}
                      d={donutSlicePath(start, end)}
                      fill={`url(#tf-gradient-${item.tone})`}
                      className={activeSlice?.name === item.name ? "active" : ""}
                      onMouseEnter={() => setHoveredDistribution(item.name)}
                      onMouseLeave={() => setHoveredDistribution(null)}
                      onClick={() => setSelectedDistribution(selectedDistribution === item.name ? null : item.name)}
                    />
                  ) : null;
                })}
                <circle className="tf-pie-core" cx="160" cy="135" r="53" fill="url(#tf-chart-core)" />
                {distribution.map((item, index) => {
                  if (item.percent < 4) return null;
                  const start = -90 + distribution.slice(0, index).reduce((sum, x) => sum + x.percent * 3.6, 0);
                  const end = start + item.percent * 3.6;
                  const point = sliceLabelPoint(start, end);
                  return <text key={`label-${item.name}`} className="tf-pie-percent" x={point.x} y={point.y}>{item.percent}%</text>;
                })}
              </svg>
              <div className="tf-pie-center">
                <small>{activeSlice ? activeSlice.name : "PRODUÇÃO TOTAL"}</small>
                <strong>{activeSlice ? brl(activeSlice.value) : brl(monthTotal)}</strong>
                <b>{activeSlice ? `${activeSlice.percent}% do total` : monthDelta === null ? `${monthRows.length} operações` : `${monthDelta >= 0 ? "▲" : "▼"} ${Math.abs(monthDelta).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</b>
                <span>{activeSlice ? `${activeSlice.count} contrato${activeSlice.count === 1 ? "" : "s"}` : "VS. MÊS ANTERIOR"}</span>
              </div>
            </div>
            <ul>
              {distribution.map((item) => (
                <li key={item.name} className={selectedDistribution === item.name ? "selected" : ""}>
                  <i className={item.tone} />
                  <button
                    type="button"
                    onClick={() => setSelectedDistribution(selectedDistribution === item.name ? null : item.name)}
                    aria-pressed={selectedDistribution === item.name}
                  >
                    <span>{item.name}<small>{brl(item.value)} · {item.count} contrato{item.count === 1 ? "" : "s"}</small></span>
                    <b>{item.percent}%</b>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      <section className="tf-quick-panel tf-quick-panel-horizontal">
        <header>
          <small>ACESSO RÁPIDO</small>
          <h2>O que deseja fazer?</h2>
        </header>
        <div>
          <button onClick={() => go("bancos")}>
            ◇
            <span>
              <b>Acessar bancos</b>
              <small>Central de links</small>
            </span>
          </button>
          <button onClick={() => go("clientes")}>
            ⌕
            <span>
              <b>Buscar cliente</b>
              <small>Consultar histórico</small>
            </span>
          </button>
          <button onClick={() => go("relatorios")}>
            ↗
            <span>
              <b>Gerar relatório</b>
              <small>Produção e comissão</small>
            </span>
          </button>
          <button onClick={() => go("atendimento")}>
            ＋
            <span>
              <b>Novo atendimento</b>
              <small>Iniciar no Kanban</small>
            </span>
          </button>
        </div>
      </section>
    </>
  );
}
function Clients({
  data,
  open,
}: {
  data: Client[];
  open: (c: Client) => void;
}) {
  return (
    <>
      <Title
        over="BASE ÚNICA DE CLIENTES"
        title="Clientes"
        text="Um cadastro por pessoa, com todo o histórico preservado."
        action="Cadastrar cliente"
      />
      <div className="tf-filters">
        <button className="active">
          Todos <b>{data.length}</b>
        </button>
        <button>Com operação ativa</button>
        <button>Sem movimentação</button>
        <span />
        <button>⚙ Filtros</button>
        <button>⇧ Importar planilhas</button>
      </div>
      <div className="tf-client-list">
        <div className="tf-list-head">
          <span>CLIENTE</span>
          <span>CONTATO</span>
          <span>BENEFÍCIO</span>
          <span>PARCEIRO</span>
          <span>OPERAÇÕES</span>
          <span>ÚLTIMA OPERAÇÃO</span>
          <span />
        </div>
        {[...data].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR",{sensitivity:"base"})).map((c) => {
          const co:Operation[] = [];
          return (
            <button
              className="tf-client-row"
              key={c.id}
              onClick={() => open(c)}
            >
              <span className="tf-client-name">
                <i>
                  {c.name
                    .split(" ")
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join("")}
                </i>
                <b>
                  {c.name}
                  <small>{formatCpf(c.cpf)}</small>
                </b>
              </span>
              <span>
                {formatPhone(c.phone)}
                <small>{c.city}</small>
              </span>
              <span>{c.benefit}</span>
              <span>{c.partner}</span>
              <strong>{co.length}</strong>
              <span>
                {co[0] ? fmt(co[0].date) : "—"}
                <small>{co[0]?.product}</small>
              </span>
              <em>›</em>
            </button>
          );
        })}
      </div>
    </>
  );
}
function OpTable({ rows, clientsData, openClient }: { rows: Operation[]; clientsData: Client[]; openClient?:(client:Client)=>void }) {
  return (
    <div className="tf-op-table">
      {rows.map((o) => {const client=clientsData.find((c) => c.id === o.clientId);return (
        <button type="button" className="tf-op-row" key={o.id} onClick={()=>client&&openClient?.(client)} disabled={!openClient}>
          <span>
            <b>{client?.name}</b>
            <small>{o.product}</small>
          </span>
          <span>
            <b>{o.bank}</b>
            <small>{fmt(o.date)}</small>
          </span>
          <strong>{brl(o.value)}</strong>
          <em className={o.status === "Em análise" ? "pending" : "done"}>
            {/finalizado|pago|conclu/i.test(o.status) ? "Finalizado" : o.status}
          </em>
          {openClient&&<i>›</i>}
        </button>
      )})}
    </div>
  );
}
function Production({ rows, clientsData, initialPeriod="2026-09", openClient }: { rows: Operation[]; clientsData: Client[]; initialPeriod?:string; openClient:(client:Client)=>void }) {
  const [statusFilter,setStatusFilter]=useState("all"),[search,setSearch]=useState(""),[periodMode,setPeriodMode]=useState("month"),[periodValue,setPeriodValue]=useState(initialPeriod);
  const currentRows=rows.filter(o=>o.date.startsWith("2026-09"));
  const augustRows=rows.filter(o=>o.date.startsWith("2026-08"));
  const registeredProducts=Array.from(new Set(rows.map(operation=>operation.product).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"pt-BR",{sensitivity:"base"}));
  const filtered=rows.filter(o=>{
    const customer=clientsData.find(c=>c.id===o.clientId)?.name||"";
    const statusOk=statusFilter==="all"||(statusFilter==="paid"?/pago|finalizado|conclu/i.test(o.status):statusFilter==="approved"?/aprov|pago|finalizado|conclu/i.test(o.status):/análise|analise/i.test(o.status));
    const searchOk=periodMode==="product"?(!search||o.product===search):(!search||`${customer} ${o.product} ${o.bank} ${o.id}`.toLowerCase().includes(search.toLowerCase()));
    const periodOk=!periodValue||(periodMode==="day"?o.date===periodValue:periodMode==="year"?o.date.startsWith(periodValue):periodMode==="month"?o.date.startsWith(periodValue):true);
    return statusOk&&searchOk&&periodOk;
  });
  const total = filtered.reduce((s, o) => s + o.value, 0),
    paid = filtered.filter((o) => /pago|finalizado|conclu/i.test(o.status)).length,
    approved = filtered.filter((o) =>
      /aprov|pago|finalizado|conclu/i.test(o.status),
    ).length;
  const periodClients=Array.from(new Set(filtered.map(operation=>operation.clientId))).map(id=>clientsData.find(client=>client.id===id)).filter(Boolean) as Client[];
  const rawPeriodLabel=periodMode==="month"&&periodValue?new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${periodValue}-01T00:00:00Z`)):periodMode==="product"&&search?`produto ${search}`:"período selecionado";
  const selectedPeriodLabel=rawPeriodLabel.charAt(0).toUpperCase()+rawPeriodLabel.slice(1);
  const modalityOrder=["Financiamento","Consignado","Proteção Auto","Consórcio","INSS","CLT","Crédito com garantia","FGTS","Seguros","Assessoria Financeira"];
  const productionGroups=productionProducts.map(product=>({name:product.name,tone:product.tone,rows:filtered.filter(operation=>product.match(operation.product))})).filter(group=>group.rows.length).sort((a,b)=>modalityOrder.indexOf(a.name)-modalityOrder.indexOf(b.name));
  const unmatchedRows=filtered.filter(operation=>!productionProducts.some(product=>product.match(operation.product)));
  if(unmatchedRows.length)productionGroups.push({name:"Outros",tone:"blue",rows:unmatchedRows});
  return (
    <>
      <Title
        over={`OPERAÇÃO COMERCIAL · ${selectedPeriodLabel.toUpperCase()}`}
        title="Produção"
        text={`Operações de ${selectedPeriodLabel}, organizadas por produto e cliente.`}
        action="Nova produção"
      />
      <section className="tf-metrics compact">
        <Metric icon="○" label="Em atendimento" value="0" note="Setembro" />
        <Metric
          icon="◌"
          label="Em análise"
          value={brl(
            filtered
              .filter((o) => /análise|analise/i.test(o.status))
              .reduce((s, o) => s + o.value, 0),
          )}
          note={`${filtered.filter((o) => /análise|analise/i.test(o.status)).length} operações`}
        />
        <Metric
          icon="✓"
          label="Aprovadas"
          value={String(approved)}
          note={brl(total)}
        />
        <Metric
          icon="R$"
          label="Finalizados"
          value={String(paid)}
          note={brl(
            filtered
              .filter((o) => /pago|finalizado|conclu/i.test(o.status))
              .reduce((s, o) => s + o.value, 0),
          )}
        />
      </section>
      <section className="tf-production-compare tf-panel"><PanelTitle over="COMPARATIVO MENSAL" title="Agosto x Setembro"/><div>{[{label:"Agosto",rows:augustRows},{label:"Setembro",rows:currentRows}].map(period=><article key={period.label}><span><b>{period.label}</b><small>{period.rows.length} operações</small></span><strong>{brl(period.rows.reduce((s,o)=>s+o.value,0))}</strong><em><small>COMISSÕES</small><b>{brl(period.rows.reduce((s,o)=>s+o.commission,0))}</b></em></article>)}</div></section>
      <section className="tf-panel">
        <div className="tf-production-controls">
          <label>Consultar por<select value={periodMode} onChange={e=>{const mode=e.target.value;setPeriodMode(mode);setSearch("");setPeriodValue(mode==="year"?"2026":mode==="day"?"2026-09-14":mode==="month"?"2026-09":"")}}><option value="month">Mês</option><option value="day">Dia</option><option value="year">Ano</option><option value="proposal">Proposta</option><option value="client">Cliente</option><option value="product">Produto</option></select></label>
          {["month","day","year"].includes(periodMode)&&<label>Período<input type={periodMode==="month"?"month":periodMode==="day"?"date":"number"} value={periodValue} onChange={e=>setPeriodValue(e.target.value)} /></label>}
          {periodMode==="product"?<label>Produto / serviço<select value={search} onChange={e=>setSearch(e.target.value)}><option value="">Todos os produtos</option>{registeredProducts.map(product=><option key={product} value={product}>{product}</option>)}</select></label>:<label>{periodMode==="proposal"?"Número da proposta":periodMode==="client"?"Nome do cliente":"Pesquisar"}<input value={search} onChange={e=>setSearch(e.target.value)} placeholder={periodMode==="client"?"Digite o nome":"Cliente, produto, banco ou proposta"}/></label>}
        </div>
        <div className="tf-filters">
          <button className={statusFilter==="all"?"active":""} onClick={()=>setStatusFilter("all")}>Todas · {filtered.length}</button>
          <button className={statusFilter==="analysis"?"active":""} onClick={()=>setStatusFilter("analysis")}>Em análise</button>
          <button className={statusFilter==="approved"?"active":""} onClick={()=>setStatusFilter("approved")}>Aprovadas</button>
          <button className={statusFilter==="paid"?"active":""} onClick={()=>setStatusFilter("paid")}>Pagas · {paid}</button>
        </div>
        <section hidden className="tf-production-clients tf-production-clients-grouped">
          <header><span><small>ACESSO RÁPIDO</small><h3>Clientes de {selectedPeriodLabel}</h3></span><b>{periodClients.length} {periodClients.length===1?"cliente":"clientes"}</b></header>
          <div className="tf-production-modalities">{productionGroups.map(group=>{const groupClients=Array.from(new Set(group.rows.map(operation=>operation.clientId))).map(id=>clientsData.find(client=>client.id===id)).filter(Boolean) as Client[];return <section className={`tf-production-modality tone-${group.tone}`} key={group.name}><header><h4>{group.name}</h4><span>{groupClients.length} {groupClients.length===1?"cliente":"clientes"} · {group.rows.length} {group.rows.length===1?"operação":"operações"}</span></header><div className="tf-production-modality-clients">{groupClients.map(client=>{const clientRows=group.rows.filter(operation=>operation.clientId===client.id);return <button type="button" key={client.id} onClick={()=>openClient(client)}><span><strong>{client.name}</strong><small>{clientRows.length} {clientRows.length===1?"operação":"operações"}</small></span><b>{brl(clientRows.reduce((sum,operation)=>sum+operation.value,0))}</b><i>›</i></button>})}</div></section>})}</div>
        </section>
        {filtered.length ? (
          <div className="tf-production-operation-groups">{productionGroups.map(group=><section className={`tf-production-operation-group tone-${group.tone}`} key={group.name}><header><h3>{group.name}</h3><span>{group.rows.length} {group.rows.length===1?"operação":"operações"} · {brl(group.rows.reduce((sum,operation)=>sum+operation.value,0))}</span></header><OpTable rows={group.rows} clientsData={clientsData} openClient={openClient}/></section>)}</div>
        ) : (
          <div className="tf-table-empty">
            <i>▤</i>
            <h2>Nenhuma produção no período</h2>
            <p>
              Cadastre a primeira operação do mês para acompanhar seu andamento.
            </p>
            <button className="tf-primary">＋ Nova produção</button>
          </div>
        )}
      </section>
    </>
  );
}

function SmartChoice({label,value,onChange,options,required=true,helper,catalogKind,catalogOptions,onCatalogChange}: {label:string;value:string;onChange:(value:string)=>void;options:string[];required?:boolean;helper?:string;catalogKind?:CatalogOption["kind"];catalogOptions?:CatalogOption[];onCatalogChange?:(option:CatalogOption)=>void}){
  const [open,setOpen]=useState(false);
  const normalized=value.trim().toLocaleLowerCase("pt-BR");
  const filtered=options.filter(option=>!normalized||option.toLocaleLowerCase("pt-BR").includes(normalized)).sort((a,b)=>a.localeCompare(b,"pt-BR",{sensitivity:"base"}));
  const catalog= catalogOptions?.filter(option=>option.kind===catalogKind && option.label.toLocaleLowerCase("pt-BR").includes(normalized)) || [];
  const saveOption=async()=>{
    if(!catalogKind||!value.trim()||filtered.some(option=>option.toLocaleLowerCase("pt-BR")===normalized))return;
    const response=await fetch('/api/catalog-options',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:catalogKind,label:value.trim()})});
    const data=await response.json();
    if(response.ok&&data.option){onCatalogChange?.(data.option);onChange(data.option.label);setOpen(false);}else alert(data.error||'Não foi possível cadastrar esta opção.');
  };
  const removeOption=async(option:CatalogOption)=>{
    const response=await fetch(`/api/catalog-options?id=${option.id}`,{method:'DELETE'});
    if(response.ok){onCatalogChange?.({...option,label:''});if(option.label===value)onChange('');}else{const data=await response.json().catch(()=>({}));alert(data.error||'Não foi possível remover esta opção.');}
  };
  return <label className="tf-smart-choice">{label}<span><input required={required} value={value} onFocus={()=>setOpen(true)} onBlur={()=>window.setTimeout(()=>setOpen(false),160)} onChange={event=>{onChange(event.target.value);setOpen(true)}} onKeyDown={event=>{if(event.key==="Escape")setOpen(false);if(event.key==="Enter"&&catalogKind){event.preventDefault();void saveOption();}}} placeholder="Digite ou selecione" autoComplete="off"/>{open&&<div className="tf-smart-options" role="listbox">{filtered.length?filtered.map(option=>{const custom=catalog.find(item=>item.label===option);return <span className="tf-smart-option" key={option}><button type="button" role="option" aria-selected={option===value} onMouseDown={event=>event.preventDefault()} onClick={()=>{onChange(option);setOpen(false)}}>{option}</button>{custom&&<button type="button" className="tf-smart-option-remove" aria-label={`Excluir ${option}`} onMouseDown={event=>event.preventDefault()} onClick={event=>{event.stopPropagation();void removeOption(custom)}}>×</button>}</span>}):<small>Nenhum nome encontrado.</small>}{catalogKind&&value.trim()&&!filtered.some(option=>option.toLocaleLowerCase("pt-BR")===normalized)&&<button type="button" className="tf-smart-add" onMouseDown={event=>event.preventDefault()} onClick={()=>void saveOption()}>＋ Cadastrar “{value.trim()}”</button>}</div>}</span>{helper&&<small>{helper}</small>}</label>;
}

function FinalChoice({label,field,details,setDetails,options,required=true}:{label:string;field:string;details:Record<string,string>;setDetails:React.Dispatch<React.SetStateAction<Record<string,string>>>;options:string[];required?:boolean}){
  const value=details[field]||"";
  if(["bank","product","operationType"].includes(field)){
    const visible=value==="__other"?details[`${field}Other`]||"":value;
    return <SmartChoice label={label} required={required} value={visible} options={options} onChange={next=>setDetails(current=>field==="product"?{...current,[field]:next,[`${field}Other`]:"",operationType:"",operationTypeOther:""}:{...current,[field]:next,[`${field}Other`]:""})} helper={field==="bank"?"Pesquise pelo nome ou digite uma nova instituição.":"Selecione uma opção ou digite um novo nome."}/>;
  }
  return <label className="tf-final-choice">{label}<select required={required} value={value} onChange={e=>setDetails(x=>({...x,[field]:e.target.value}))}><option value="">{required?"Selecione":"Não se aplica"}</option>{options.map(option=><option key={option}>{option}</option>)}<option value="__other">Cadastrar outro</option></select>{value==="__other"&&<input autoFocus required value={details[`${field}Other`]||""} onChange={e=>setDetails(x=>({...x,[`${field}Other`]:e.target.value}))} placeholder={`Informe ${label.toLowerCase()}`}/>}</label>;
}

function Kanban({
  deals,
  setDeals,
  user,
  members,
  partnerNames,
  receivables,
  catalogOptions,
  onCatalogChange,
  newDealRequest,
  onMarkReceived,
  onReceivableCreated,
  onDataChanged,
}: {
  deals: Deal[];
  setDeals: React.Dispatch<React.SetStateAction<Deal[]>>;
  user:DashboardUser;
  members:TeamMember[];
  partnerNames:string[];
  receivables:Receivable[];
  catalogOptions:CatalogOption[];
  onCatalogChange:(option:CatalogOption)=>void;
  newDealRequest:number;
  onMarkReceived:(id:number)=>void;
  onReceivableCreated:(item:Receivable)=>void;
  onDataChanged:()=>void;
}) {
  const baseColumns = [
    ["atendimento", "Atendimento", "Entrada"],
    ["analise", "Em análise", "Proposta"],
    ["indecisao", "Indecisão", "Acompanhamento"],
    ["fechamento", "Em fechamento", "Negociação"],
    ["assinatura", "Em assinatura", "Formalização"],
    ["contratado", "Contratado", "Contrato"],
    ["finalizado", "Finalizado", "Concluído"],
  ];
  const [columnLabels,setColumnLabels]=useState<Record<string,string>>(()=>{try{return typeof window==="undefined"?{}:JSON.parse(localStorage.getItem("tf_kanban_columns")||"{}")}catch{return {}}});
  const columns=baseColumns.map(([stage,name,sub])=>[stage,columnLabels[stage]||name,sub]);
  const managedOptions=(kind:CatalogOption["kind"],base:string[])=>Array.from(new Set([...base,...catalogOptions.filter(option=>option.kind===kind).map(option=>option.label)].filter(option=>option&&option.toLocaleLowerCase("pt-BR")!=="teste 3"))).sort((a,b)=>a.localeCompare(b,"pt-BR",{sensitivity:"base"}));
  const [form, setForm] = useState(false),
    [formStep, setFormStep] = useState<1 | 2>(1),
    [selectedProduct, setSelectedProduct] = useState("Financiamento"),
    [active, setActive] = useState<Deal | null>(null),
    [documentsDeal, setDocumentsDeal] = useState<Deal | null>(null),
    [details, setDetails] = useState<Record<string, string>>({}),
    [menuId, setMenuId] = useState<number | null>(null),
    [returnDeal, setReturnDeal] = useState<Deal | null>(null),
    [returnForm, setReturnForm] = useState({returnAt:"",returnReason:"",returnNotes:"",phone:""}),
    [historyDeal, setHistoryDeal] = useState<Deal | null>(null),
    [editDeal, setEditDeal] = useState<Deal | null>(null),
    [editForm, setEditForm] = useState<Record<string,string>>({}),
    [showReturns, setShowReturns] = useState(false),
    [resumeStages,setResumeStages]=useState<Record<number,string>>({}),
    [clock,setClock]=useState(()=>Date.now()),
    [finalizing,setFinalizing]=useState(false),
    [kanbanOwner,setKanbanOwner]=useState<string>(user.role==="employee"?String(user.memberId):"owner"),
    [confirmAction, setConfirmAction] = useState<{
      deal: Deal;
      permanent: boolean;
    } | null>(null);
  useEffect(()=>{if(newDealRequest>0){setFormStep(1);setSelectedProduct("Financiamento");setForm(true)}},[newDealRequest]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setForm(false);
        setFormStep(1);
        setSelectedProduct("Financiamento");
        setActive(null);
        setDocumentsDeal(null);
        setMenuId(null);
        setReturnDeal(null);
        setHistoryDeal(null);
        setEditDeal(null);
        setShowReturns(false);
        setConfirmAction(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),30000);return()=>window.clearInterval(timer)},[]);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    if (formStep === 1) {
      setFormStep(2);
      return;
    }
    const body = {
      name: String(f.get("name")),
      cpf: String(f.get("cpf")),
      birthDate: dateToIso(String(f.get("birthDate"))),
      product: String(f.get("product")),
      operationType: String(f.get("operationType")||""),
      phone: maskPhone(String(f.get("phone") || "")),
      vehiclePlate: String(f.get("vehiclePlate") || ""),
      vehicleValue: moneyToStorage(String(f.get("vehicleValue") || "")),
      financedValue: moneyToStorage(String(f.get("financedValue") || "")),
      desiredCredit: moneyToStorage(String(f.get("desiredCredit") || "")),
      loanValue: moneyToStorage(String(f.get("loanValue") || "")),
      assignedUserId:kanbanOwner==="owner"?null:Number(kanbanOwner),
    };
    const r = await fetch("/api/deals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const x = await r.json();
    if (r.ok) {
      setDeals((d) => [x.deal, ...d]);
      setForm(false);
      setFormStep(1);
      setSelectedProduct("Financiamento");
      onDataChanged();
    } else alert(x.error || "Não foi possível iniciar o atendimento.");
  };
  const nowDate=new Date(clock);
  const nowIso = new Date(clock-nowDate.getTimezoneOffset()*60000).toISOString().slice(0,16);
  const visibleDeals=deals.filter(d=>kanbanOwner==="owner"?!d.assignedUserId:d.assignedUserId===Number(kanbanOwner));
  const pendingReturns = visibleDeals.filter((d)=>d.returnAt&&d.returnStatus!=="concluido");
  const todayReturns = pendingReturns.filter((d)=>d.returnAt!<=nowIso);
  const futureDeals=pendingReturns.filter(d=>d.returnAt!>nowIso).sort((a,b)=>a.returnAt!.localeCompare(b.returnAt!));
  const scheduledReceivables=[...receivables].filter(item=>item.dueDate).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const pipelineDeals=visibleDeals.filter(d=>!pendingReturns.some(scheduled=>scheduled.id===d.id));
  const openReturn = (d:Deal) => {
    setReturnDeal(d);
    setReturnForm({returnAt:d.returnAt||"",returnReason:d.returnReason||"",returnNotes:d.returnNotes||"",phone:formatPhone(d.phone)==="Não informado"?"":formatPhone(d.phone)});
    setMenuId(null);
  };
  const saveReturn = async (e:React.FormEvent) => {
    e.preventDefault(); if(!returnDeal)return;
    const r=await fetch('/api/deals',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:returnDeal.id,action:'schedule_return',...returnForm})});
    const x=await r.json();
    if(r.ok){setDeals(xs=>xs.map(d=>d.id===returnDeal.id?{...d,...x.deal}:d));setReturnDeal(null);onDataChanged()}else alert(x.error||'Não foi possível agendar o retorno.');
  };
  const completeReturn = async (d:Deal) => {
    const r=await fetch('/api/deals',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:d.id,action:'complete_return'})});
    const x=await r.json(); if(r.ok)setDeals(xs=>xs.map(v=>v.id===d.id?{...v,...x.deal}:v));
  };
  const resumeFlow=async(d:Deal)=>{
    const resumeStage=resumeStages[d.id]||'atendimento';
    const r=await fetch('/api/deals',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:d.id,action:'resume_flow',resumeStage})});
    const x=await r.json();
    if(r.ok){setDeals(xs=>xs.map(v=>v.id===d.id?{...v,...x.deal}:v));setResumeStages(s=>{const next={...s};delete next[d.id];return next});if(todayReturns.length===1)setShowReturns(false)}else alert(x.error||'Não foi possível reiniciar o fluxo.');
  };
  const openEdit = (d:Deal) => {
    setEditDeal(d);
    setEditForm({
      name:d.name||"",cpf:formatCpf(d.cpf),birthDate:formatDateBr(d.birthDate),phone:formatPhone(d.phone)==="Não informado"?"":formatPhone(d.phone),
      product:d.product||"",vehiclePlate:d.vehiclePlate||"",vehicleValue:formatMoneyInput(d.vehicleValue),
      financedValue:formatMoneyInput(d.financedValue),desiredCredit:formatMoneyInput(d.desiredCredit),loanValue:formatMoneyInput(d.loanValue),
    });
    setMenuId(null);
  };
  const saveEdit = async (e:React.FormEvent) => {
    e.preventDefault();
    if(!editDeal)return;
    const normalizedEdit={
      ...editForm,
      cpf:cpfKey(editForm.cpf),
      birthDate:dateToIso(editForm.birthDate),
      phone:maskPhone(editForm.phone||""),
      vehicleValue:moneyToStorage(editForm.vehicleValue),
      financedValue:moneyToStorage(editForm.financedValue),
      desiredCredit:moneyToStorage(editForm.desiredCredit),
      loanValue:moneyToStorage(editForm.loanValue),
    };
    const r=await fetch('/api/deals',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:editDeal.id,action:'edit',details:normalizedEdit})});
    const x=await r.json();
    if(r.ok){setDeals(xs=>xs.map(d=>d.id===editDeal.id?{...d,...x.deal}:d));setEditDeal(null);onDataChanged()}
    else alert(x.error||'Não foi possível editar o atendimento.');
  };
  const digits=(v='')=>v.replace(/\D/g,'');
  const calendarUrl=(d:Deal)=>{
    const start=(d.returnAt||'').replace(/[-:]/g,'').replace('T','T')+'00';
    const end=new Date(new Date(d.returnAt||'1970-01-01T00:00').getTime()+30*60000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Retorno - '+d.name)}&dates=${start}/${end}&details=${encodeURIComponent((d.returnReason||'')+'\n'+(d.returnNotes||''))}`;
  };
  const move = async (d: Deal, stage: string) => {
    if (stage === "finalizado" && d.stage === "finalizado") {
      const today=new Date(),todayIso=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
      const savedBank=(d as Deal & {bank?:string}).bank||"",savedPromoter=(d as Deal & {promoter?:string}).promoter||"",savedOrigin=d.origin||"Sem parceiro";
      setActive(d);
      const dueDate=new Date(today);dueDate.setDate(dueDate.getDate()+10);const dueDateIso=new Date(dueDate.getTime()-dueDate.getTimezoneOffset()*60000).toISOString().slice(0,10);
      setDetails({
        name: d.name,
        documentType:"CPF",
        cpf: formatCpf(d.cpf),
        benefit:"",
        birthDate: formatDateBr(d.birthDate),
        phone: formatPhone(d.phone) === "Não informado" ? "" : formatPhone(d.phone),
        bank:finalBankOptions.includes(savedBank)?savedBank:savedBank?"__other":"",
        bankOther:finalBankOptions.includes(savedBank)?"":savedBank,
        agreement:d.agreement||agreementForProduct(d.product||""),
        contractType:d.contractType||d.product||"",
        product:productOptions.includes(d.product)?d.product:"__other",
        productOther:productOptions.includes(d.product)?"":d.product,
        operationType:d.operationType||"",
        operationTypeOther:"",
        quotaQuantity:d.quotaQuantity||"1",
        quotaUnitValue:formatMoneyInput(d.quotaUnitValue),
        fipeValue:formatMoneyInput(d.fipeValue),
        promoter:finalPromoterOptions.includes(savedPromoter)?savedPromoter:savedPromoter?"__other":"",
        promoterOther:finalPromoterOptions.includes(savedPromoter)?"":savedPromoter,
        producer:d.producer|| (savedOrigin==="GG Veículos"?"Cliente GG / Código GG":"Balcão TF"),
        producerOther:"",
        origin:savedOrigin==="GG Veículos"?"GG Veículos":"TF",
        originOther:"",
        contractStatus:/pago|finalizado/i.test(d.contractStatus||"")?"Finalizado":d.contractStatus||"Finalizado",
        paidDate:d.paidDate||todayIso,
        operationDate:d.operationDate||todayIso,
        productionIndicator:d.productionIndicator||"Balcão",
        installment:formatMoneyInput(d.installment),
        value:formatMoneyInput(d.value),
        term:d.term||"",
        dueDay:d.dueDay||"",
        adhesionFee:formatMoneyInput(d.adhesionFee),
        advisoryFee:formatMoneyInput(d.advisoryFee),
        bonus:formatMoneyInput(d.bonus),
        commissionRate:d.commissionRate||(/consórcio/i.test(d.product)?"4":/financiamento/i.test(d.product)?"3":""),
        commissionCustomRate:d.commissionCustomRate||"",
        commissionInstallments:d.commissionInstallments||(/consórcio/i.test(d.product)?"4":"1"),
        commissionPaid:d.commissionPaid||"Não",
        commissionDueDate:d.commissionDueDate||dueDateIso,
        invoiceRequired:d.invoiceRequired||"Não",
        invoiceNumber:d.invoiceNumber||"",
        invoiceValue:formatMoneyInput(d.invoiceValue),
        invoiceIssuedAt:d.invoiceIssuedAt||todayIso,
        invoicePaid:d.invoicePaid||"Não",
        postSale:d.postSale||"Pendente",
        postSaleNotes:d.postSaleNotes||"",
      });
      return;
    }
    if (stage === "finalizado") {
      const r = await fetch("/api/deals", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: d.id, stage: "finalizado" }),
      });
      const x = await r.json();
      if (r.ok)
        setDeals((xs) =>
          xs.map((item) =>
            item.id === d.id
              ? { ...item, stage: "finalizado", status: x.status, needsCompletion: true }
              : item,
          ),
        );
      return;
    }
    const r = await fetch("/api/deals", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: d.id, stage }),
    });
    if (r.ok)
      setDeals((xs) =>
        xs.map((x) =>
          x.id === d.id ? { ...x, stage, status: "aberto", needsCompletion: false } : x,
        ),
      );
  };
  const remove = async (d: Deal, permanent = false) => {
    const r = permanent
      ? await fetch(`/api/deals?id=${d.id}`, { method: "DELETE" })
      : await fetch("/api/deals", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: d.id, stage: "cancelado" }),
        });
    if (r.ok) {
      setDeals((xs) => xs.filter((x) => x.id !== d.id));
      setMenuId(null);
      setConfirmAction(null);
    } else {
      const x = await r.json();
      alert(x.error || "Não foi possível concluir a ação.");
    }
  };
  const finalize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || finalizing) return;
    setFinalizing(true);
    try {
      const operationValue=operationValueForDetails(details);
      const normalizedDetails = {
        ...details,
        bank:details.bank==="__other"?details.bankOther:details.bank,
        product:details.contractType||(details.product==="__other"?details.productOther:details.product),
        contractType:details.contractType||(details.product==="__other"?details.productOther:details.product),
        operationType:details.operationType==="__other"?details.operationTypeOther:details.operationType,
        promoter:details.promoter==="__other"?details.promoterOther:details.promoter,
        producer:details.producer==="__other"?details.producerOther:details.producer,
        origin:details.origin==="__other"?details.originOther:details.origin,
        cpf: cpfKey(details.cpf),
        birthDate: dateToIso(details.birthDate),
        phone: maskPhone(details.phone || ""),
        value: moneyToStorage(operationValue),
        quotaQuantity:details.quotaQuantity||"1",
        quotaUnitValue:moneyToStorage(details.quotaUnitValue),
        fipeValue:moneyToStorage(details.fipeValue),
        installment: moneyToStorage(details.installment),
        adhesionFee:moneyToStorage(details.adhesionFee),
        advisoryFee:moneyToStorage(details.advisoryFee),
        bonus:moneyToStorage(details.bonus),
        operationDate: dateToIso(details.operationDate),
        paidDate:dateToIso(details.paidDate),
      };
      const r = await fetch("/api/deals", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: active.id, stage: "finalizado", details: normalizedDetails }),
      });
      const x = await r.json();
      if (r.ok) {
        setDeals((xs) => xs.filter((d) => d.id !== active.id));
        if(Array.isArray(x.receivables))x.receivables.forEach((item:Receivable)=>onReceivableCreated(item));
        else if(x.receivable)onReceivableCreated(x.receivable);
        onDataChanged();
        setActive(null);
      } else alert(x.error || "Revise os campos.");
    } catch {
      alert("Não foi possível salvar o cadastro. Tente novamente.");
    } finally {
      setFinalizing(false);
    }
  };
  return (
    <>
      <Title
        over="PIPELINE COMERCIAL"
        title="Atendimento"
        text="Acompanhe cada cliente da entrada até a contratação."
        action="Novo atendimento"
        onAction={() => setForm(true)}
      />
      {todayReturns.length>0&&<button className="tf-return-alert" onClick={()=>setShowReturns(true)}><Clock3/><span><b>{todayReturns.length===1?'Há 1 cliente para atender hoje':`Há ${todayReturns.length} clientes para atender hoje`}</b><small>Abra a lista e escolha em qual etapa cada atendimento deve recomeçar.</small></span></button>}
      <div className="tf-kanban-owner">
        <span><UserRoundCog/><b>Kanban exibido</b></span>
        <select value={kanbanOwner} onChange={e=>setKanbanOwner(e.target.value)} disabled={user.role==="employee"}>
          {user.role==="admin"&&<option value="owner">Gestor TF</option>}
          {members.filter(m=>m.active&&m.permissions.includes('atendimento')).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
          {user.role==="employee"&&<option value={String(user.memberId)}>{user.name}</option>}
        </select>
        <small>{user.role==="admin"?"Você pode acompanhar a agenda e o funil de cada responsável.":"Este espaço contém somente seus atendimentos."}</small>
      </div>
      <section className="tf-kanban">
        {columns.map(([stage, name, sub], i) => {
          const rows = pipelineDeals.filter((d) => d.stage === stage);
          return (
            <article
              key={stage}
              className={`stage-${i}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = Number(e.dataTransfer.getData("text/plain")),
                  deal = pipelineDeals.find((x) => x.id === id);
                if (deal && deal.stage !== stage) move(deal, stage);
              }}
            >
              <header>
                <span>
                  <i className={`dot d${i % 5}`} />
                  <b>{name}</b>
                  <small>{sub}</small>
                </span>
                <em>{rows.length}</em>
                <button aria-label={`Editar nome de ${name}`} title="Renomear etapa" onClick={()=>{const next=window.prompt("Novo nome da etapa",name);if(next?.trim()){const labels={...columnLabels,[stage]:next.trim()};setColumnLabels(labels);localStorage.setItem("tf_kanban_columns",JSON.stringify(labels))}}}>•••</button>
              </header>
              <div className="tf-stage-total">
                <span>Total da etapa</span>
                <b>{rows.length}</b>
              </div>
              <div className="tf-deal-stack">
                {rows.map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(d.id));
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className={`tf-deal-card deal-stage-${i} ${d.returnAt&&d.returnStatus!=="concluido"&&d.returnAt<=nowIso?'return-due':''} ${stage === "finalizado" && (d.needsCompletion || d.status !== "concluido") ? "needs-completion" : ""}`}
                  >
                    <button
                      type="button"
                      className="tf-deal-options"
                      aria-label={`Opções de ${d.name}`}
                      onClick={() => setMenuId(menuId === d.id ? null : d.id)}
                    >
                      •••
                    </button>
                    {menuId === d.id && (
                      <div className="tf-deal-menu">
                        <button type="button" onClick={() => openEdit(d)}>
                          Editar cadastro
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuId(null);
                            setConfirmAction({ deal: d, permanent: false });
                          }}
                        >
                          Cancelar atendimento
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            setMenuId(null);
                            setConfirmAction({ deal: d, permanent: true });
                          }}
                        >
                          Excluir definitivamente
                        </button>
                      </div>
                    )}
                    <div className="tf-card-heading"><strong>{d.name}</strong><span className="tf-card-product">{d.product||"Produto não informado"}</span></div>
                    <small className="tf-card-detail"><b>CPF:</b> {formatCpf(d.cpf)}</small>
                    <small className="tf-card-detail"><b>Nascimento:</b> {formatDateBr(d.birthDate)}</small>
                    <span className="tf-card-phone tf-card-detail"><b>Telefone:</b> {formatPhone(d.phone)}</span>
                    {stage === "finalizado" && (d.needsCompletion || d.status !== "concluido")&&<em className="tf-card-pending-label">FINALIZAR CADASTRO</em>}
                    {d.returnAt&&d.returnStatus!=="concluido"&&<span className="tf-card-return"><Clock3/> {new Date(d.returnAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} · {d.returnReason}</span>}
                    <div className="tf-card-actions">
                      <button type="button" title="WhatsApp" disabled={!digits(d.phone)} onClick={()=>window.open(`https://wa.me/55${digits(d.phone)}`,'_blank')}><MessageCircle/></button>
                      <button type="button" title="Ligar" disabled={!digits(d.phone)} onClick={()=>{window.location.href=`tel:${digits(d.phone)}`}}><Phone/></button>
                      <button type="button" title="Agendar retorno" onClick={()=>openReturn(d)}><CalendarDays/></button>
                      <button type="button" title="Histórico" onClick={()=>setHistoryDeal(d)}><History/></button>
                      <button type="button" title="Documentos" onClick={()=>setDocumentsDeal(d)}><Paperclip/></button>
                      {stage !== "finalizado" && (
                        <button
                          type="button"
                          className="tf-card-next"
                          title="Avançar para a próxima etapa"
                          aria-label={`Avançar atendimento de ${d.name}`}
                          onClick={() =>
                            move(d, columns[Math.min(i + 1, columns.length - 1)][0])
                          }
                        >
                          <ChevronRight />
                        </button>
                      )}
                    </div>
                    {stage === "finalizado" && (
                      <button
                        className="tf-card-finalize"
                        onClick={() => move(d, "finalizado")}
                      >
                        {d.needsCompletion || d.status !== "concluido"
                          ? "Finalizar cadastro"
                          : "Ver cadastro completo"}
                      </button>
                    )}
                  </div>
                ))}
                {!rows.length && (
                  <div className="tf-kanban-empty">
                    <button
                      type="button"
                      aria-label="Adicionar negócio"
                      onClick={() => setForm(true)}
                    >
                      <Plus />
                    </button>
                    <span>Nenhum atendimento</span>
                  </div>
                )}
              </div>
              <footer>
                <button onClick={() => setForm(true)}>
                  <Plus />{" "}
                  {stage === "atendimento"
                    ? "Novo atendimento"
                    : "Adicionar negócio"}
                </button>
              </footer>
            </article>
          );
        })}
      </section>
      <section className="tf-scheduled-board tf-scheduled-bottom">
        <header><div><small>AGENDA DE ATENDIMENTOS E COBRANÇAS</small><h2>Próximos contatos</h2><p>Retornos de clientes e receitas a cobrar ficam reunidos aqui pela data marcada.</p></div><b>{futureDeals.length+scheduledReceivables.length}</b></header>
        <div>{scheduledReceivables.map(item=><article className="tf-revenue-contact" key={`revenue-${item.id}`}><span><BadgeDollarSign/><small>{new Date(`${item.dueDate}T12:00:00`).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</small><b>{item.dueDate<new Date().toISOString().slice(0,10)?'ATRASADO':'COBRAR'}</b></span><div><b>{item.name}</b><small>{item.product} · {item.type}</small><p>Receita prevista de {brl(item.value)}</p></div><footer><button onClick={()=>onMarkReceived(item.id)}><CheckCircle2/> Marcar recebido</button></footer></article>)}{futureDeals.map(d=><article key={d.id}><span><Clock3/><small>{new Date(d.returnAt!).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</small><b>{new Date(d.returnAt!).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</b></span><div><b>{d.name}</b><small>{formatCpf(d.cpf)} · {d.product}</small><p>{d.returnReason}</p></div><footer><a href={calendarUrl(d)} target="_blank" rel="noreferrer"><CalendarDays/> Google Agenda <ExternalLink/></a><button onClick={()=>openReturn(d)}><Clock3/> Reagendar</button></footer></article>)}{!futureDeals.length&&!scheduledReceivables.length&&<div className="tf-scheduled-empty"><CalendarDays/><span><b>Nenhum contato futuro</b><small>Retornos e cobranças agendadas aparecerão aqui.</small></span></div>}</div>
      </section>
      {documentsDeal && <DealDocuments deal={documentsDeal} close={() => setDocumentsDeal(null)} />}
      {form && (
        <div className="tf-modal-back">
          <form className="tf-modal" onSubmit={create}>
            <button
              type="button"
              className="tf-modal-close"
              onClick={() => {
                setForm(false);
                setFormStep(1);
              }}
            >
              ×
            </button>
            <small>{formStep === 1 ? "INÍCIO DO ATENDIMENTO" : "DADOS DO ATENDIMENTO"}</small>
            <h2>{formStep === 1 ? "Novo atendimento" : "Especificações da operação"}</h2>
            <p>{formStep === 1 ? "Escolha primeiro o produto do cliente." : "Preencha os dados para criar o cartão completo no Kanban."}</p>
            {formStep === 1 ? (
              <>
                <label>
                  Produto
                  <select name="product" value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)} autoFocus>
                    {productOptions.map((option)=><option key={option}>{option}</option>)}
                  </select>
                </label>
                <button className="tf-primary">Continuar</button>
              </>
            ) : (
              <>
                <label>
                  Produto
                  <select name="product" value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
                    {productOptions.map((option)=><option key={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  Nome completo
                  <input name="name" required autoFocus />
                </label>
                <label>
                  Tipo de operação
                  <select name="operationType" key={selectedProduct} defaultValue={operationOptionsFor(selectedProduct)[0]}>
                    {operationOptionsFor(selectedProduct).map((option)=><option key={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  CPF
                  <input
                    name="cpf"
                    required
                    inputMode="numeric"
                    maxLength={14}
                    placeholder="000.000.000-00"
                    onInput={(e) => {
                      e.currentTarget.value = maskCpf(e.currentTarget.value);
                    }}
                  />
                </label>
                <label>
                  Data de nascimento
                  <input name="birthDate" inputMode="numeric" maxLength={10} placeholder="DD/MM/AAAA" onInput={(e)=>{e.currentTarget.value=maskDate(e.currentTarget.value)}} required />
                </label>
                <label>
                  Telefone / WhatsApp
                  <input name="phone" inputMode="tel" maxLength={15} placeholder="(88) 99999-9999" onInput={(e)=>{e.currentTarget.value=maskPhone(e.currentTarget.value)}} required />
                </label>
                <div className="tf-form-divider">Dados da operação</div>
                {(selectedProduct === "Financiamento" || selectedProduct === "Crédito com garantia") && (
                  <>
                    <label>Placa do veículo<input name="vehiclePlate" placeholder="ABC1D23" required /></label>
                    <label>Valor total do veículo<CurrencyInput name="vehicleValue" inputMode="decimal" placeholder="R$ 95.000,00"  required /></label>
                    <label>{selectedProduct === "Financiamento" ? "Valor do financiamento" : "Valor desejado com garantia"}<CurrencyInput name="financedValue" inputMode="decimal" placeholder="R$ 65.000,00"  required /></label>
                  </>
                )}
                {selectedProduct === "Consórcio" && (
                  <label>Crédito / carta desejada<CurrencyInput name="desiredCredit" inputMode="decimal" placeholder="R$ 50.000,00"  required /></label>
                )}
                {/^Consignado\b/i.test(selectedProduct) && (
                  <label>Valor do consignado<CurrencyInput name="loanValue" inputMode="decimal" placeholder="R$ 20.000,00"  required /></label>
                )}
                {(["Seguros","Proteção Auto","FGTS","Assessoria Financeira"].includes(selectedProduct)) && (
                  <p className="tf-form-hint">Para este produto, somente os dados básicos são necessários neste primeiro atendimento.</p>
                )}
                <div className="tf-modal-actions">
                  <button type="button" className="tf-secondary" onClick={() => setFormStep(1)}>Voltar</button>
                  <button className="tf-primary">Iniciar atendimento</button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
      {editDeal && (
        <div className="tf-modal-back">
          <form className="tf-modal tf-edit-deal-modal" onSubmit={saveEdit}>
            <button type="button" className="tf-modal-close" onClick={()=>setEditDeal(null)}>×</button>
            <small>EDITAR ATENDIMENTO</small>
            <h2>Dados do lead</h2>
            <p>Atualize as informações exibidas no cartão.</p>
            <div className="tf-form-grid">
              <label>Nome completo<input required autoFocus value={editForm.name||""} onChange={e=>setEditForm(x=>({...x,name:e.target.value}))}/></label>
              <label>CPF<input required inputMode="numeric" maxLength={14} value={editForm.cpf||""} onChange={e=>setEditForm(x=>({...x,cpf:maskCpf(e.target.value)}))}/></label>
              <label>Data de nascimento<input required inputMode="numeric" maxLength={10} placeholder="DD/MM/AAAA" value={editForm.birthDate||""} onChange={e=>setEditForm(x=>({...x,birthDate:maskDate(e.target.value)}))}/></label>
              <label>Telefone / WhatsApp<input inputMode="tel" maxLength={15} value={editForm.phone||""} onChange={e=>setEditForm(x=>({...x,phone:maskPhone(e.target.value)}))}/></label>
              <label>Produto<select value={editForm.product||"Financiamento"} onChange={e=>setEditForm(x=>({...x,product:e.target.value}))}>{productOptions.map((option)=><option key={option}>{option}</option>)}</select></label>
              <label>Placa do veículo<input value={editForm.vehiclePlate||""} onChange={e=>setEditForm(x=>({...x,vehiclePlate:e.target.value.toUpperCase()}))}/></label>
              <label>Valor do veículo<CurrencyInput inputMode="decimal" value={editForm.vehicleValue||""} onChange={nextValue=>setEditForm(x=>({...x,vehicleValue:nextValue}))} /></label>
              <label>Valor financiado / desejado<CurrencyInput inputMode="decimal" value={editForm.financedValue||editForm.desiredCredit||editForm.loanValue||""} onChange={nextValue=>setEditForm(x=>({...x,financedValue:nextValue,desiredCredit:nextValue,loanValue:nextValue}))} /></label>
            </div>
            <div className="tf-modal-actions"><button type="button" className="tf-secondary" onClick={()=>setEditDeal(null)}>Cancelar</button><button className="tf-primary">Salvar alterações</button></div>
          </form>
        </div>
      )}
      {active && (
        <div className="tf-modal-back">
          <form className="tf-modal tf-modal-wide" onSubmit={finalize}>
            <button
              type="button"
              className="tf-modal-close"
              onClick={() => setActive(null)}
            >
              ×
            </button>
            <div className="tf-finalize-alert" role="alert">
              <span>!</span>
              <div>
                <b>Operação concluída</b>
                <small>
                  Finalize o cadastro para enviar este atendimento à etapa
                  “Finalizado”.
                </small>
              </div>
            </div>
            <small>FINALIZAÇÃO DO CADASTRO</small>
            <h2 className="tf-finalize-title">FINALIZAÇÃO DO CADASTRO</h2>
            <span className="tf-finalize-status"><CheckCircle2/> Finalizado</span>
            <h3>Complete todas as informações</h3>
            <p>
              Ao concluir, o cliente e a operação serão registrados na base TF.
            </p>
            {false && <div className="tf-form-grid">
              <label>Nome completo<input required value={details.name||""} onChange={e=>setDetails(x=>({...x,name:e.target.value}))}/></label>
              <label>Data do cadastro<input required type="date" value={details.operationDate||""} onChange={e=>setDetails(x=>({...x,operationDate:e.target.value}))}/></label>
              <label className="tf-document-field">CPF ou benefício<span><select value={details.documentType||"CPF"} onChange={e=>setDetails(x=>({...x,documentType:e.target.value}))}><option>CPF</option><option>Benefício</option></select>{details.documentType==="Benefício"?<input required inputMode="numeric" value={details.benefit||""} onChange={e=>setDetails(x=>({...x,benefit:e.target.value.replace(/[^\d.-]/g,"")}))} placeholder="Número do benefício"/>:<input required inputMode="numeric" maxLength={14} value={details.cpf||""} onChange={e=>setDetails(x=>({...x,cpf:maskCpf(e.target.value)}))} placeholder="000.000.000-00"/>}</span></label>
              <label>Data de nascimento<input required inputMode="numeric" maxLength={10} value={details.birthDate||""} onChange={e=>setDetails(x=>({...x,birthDate:maskDate(e.target.value)}))} placeholder="DD/MM/AAAA"/></label>
              <FinalChoice label="Banco / instituição" field="bank" details={details} setDetails={setDetails} options={finalBankOptions}/>
              <SmartChoice label="Convênio" required={false} value={details.agreement||""} options={agreementOptions} onChange={value=>setDetails(current=>({...current,agreement:value,contractType:"",product:"",operationType:""}))} helper="Selecione o convênio ou cadastre um novo."/>
              <SmartChoice label="Tipo de contrato" value={details.contractType||resolvedProduct(details)} options={contractTypeOptionsFor(details.agreement||"")} onChange={value=>setDetails(current=>({...current,contractType:value,product:value,operationType:""}))} helper="As opções acompanham o convênio selecionado."/>
              <FinalChoice label="Tipo de operação" field="operationType" details={details} setDetails={setDetails} options={operationOptionsFor(details.contractType||resolvedProduct(details))}/>
              <label>Valor da parcela<CurrencyInput required={/proteção auto/i.test(resolvedProduct(details))} inputMode="decimal" value={details.installment||""} onChange={nextValue=>setDetails(x=>({...x,installment:nextValue}))}  placeholder="R$ 0,00 (se aplicável)"/></label>
              {/consórcio/i.test(resolvedProduct(details))?<><label>Quantidade de cotas<input required type="number" min="1" max="999" value={details.quotaQuantity||"1"} onChange={e=>setDetails(x=>({...x,quotaQuantity:e.target.value}))}/></label><label>Valor por cota<CurrencyInput required inputMode="decimal" value={details.quotaUnitValue||""} onChange={nextValue=>setDetails(x=>({...x,quotaUnitValue:nextValue}))}  placeholder="R$ 0,00"/><output>Valor total: {brl(operationValueForDetails(details))}</output></label></>:/proteção auto/i.test(resolvedProduct(details))?<label>Valor FIPE<CurrencyInput inputMode="decimal" value={details.fipeValue||""} onChange={nextValue=>setDetails(x=>({...x,fipeValue:nextValue}))}  placeholder="R$ 0,00"/><output>Produção do mês: {brl(operationValueForDetails(details))}</output></label>:<label>Valor da operação<CurrencyInput required inputMode="decimal" value={details.value||""} onChange={nextValue=>setDetails(x=>({...x,value:nextValue}))}  placeholder="R$ 0,00"/></label>}
              <label>Prazo da operação<input type="number" min="1" value={details.term||""} onChange={e=>setDetails(x=>({...x,term:e.target.value}))} placeholder="Ex.: 84 (se aplicável)"/></label>
              <label>Dia do vencimento<input inputMode="numeric" maxLength={2} value={details.dueDay||""} onChange={e=>setDetails(x=>({...x,dueDay:e.target.value.replace(/\D/g,"").slice(0,2)}))} placeholder="Ex.: 10 (se aplicável)"/></label>
              <label>Situação do contrato<select required value={details.contractStatus||"Finalizado"} onChange={e=>setDetails(x=>({...x,contractStatus:e.target.value}))}><option>Finalizado</option><option>Concluído</option><option>Pendência</option></select></label>
              {["Finalizado","Concluído"].includes(details.contractStatus||"Finalizado")&&<label>Data da conclusão<input required type="date" value={details.paidDate||""} onChange={e=>setDetails(x=>({...x,paidDate:e.target.value}))}/></label>}
              <FinalChoice label="Promotora" field="promoter" details={details} setDetails={setDetails} options={finalPromoterOptions} required={false}/>
              <FinalChoice label="Produção" field="producer" details={details} setDetails={setDetails} options={["Balcão","TF","CDF","Parceiro GG Veículos",...Array.from(new Set([user.name,...members.map(member=>member.name)])).filter(name=>!["Balcão","TF","CDF","Parceiro GG Veículos"].includes(name)).sort((a,b)=>a.localeCompare(b,"pt-BR",{sensitivity:"base"}))]}/>
              <SmartChoice label="Quem indicou a produção" required={false} value={details.productionIndicator||""} options={["Balcão","Indicação direta","Parceiro","Prospecção","WhatsApp",...members.map(member=>member.name)]} onChange={value=>setDetails(current=>({...current,productionIndicator:value}))} helper="Digite o nome do indicador quando houver."/>
              <FinalChoice label="Parceiro / origem" field="origin" details={details} setDetails={setDetails} options={Array.from(new Set(["TF","GG Veículos",...partnerNames]))}/>
              <label>Taxa de adesão<CurrencyInput inputMode="decimal" value={details.adhesionFee||""} onChange={nextValue=>setDetails(x=>({...x,adhesionFee:nextValue}))}  placeholder="R$ 0,00 (seguros)"/></label>
              <label>Taxa de assessoria<CurrencyInput value={details.advisoryFee||""} onChange={value=>setDetails(x=>({...x,advisoryFee:value}))}/></label>
              <label>Comissão percentual<input inputMode="decimal" value={details.commissionRate||""} onChange={e=>setDetails(x=>({...x,commissionRate:e.target.value.replace(/[^\d,.]/g,"")}))} placeholder="Ex.: 3%"/><output>Comissão calculada: {brl(operationValueForDetails(details)*(Number(String(details.commissionRate||"0").replace(",","."))/100))}</output></label>
              <label>Comissão / adesão / assessoria recebidas?<select value={details.commissionPaid||"Não"} onChange={e=>setDetails(x=>({...x,commissionPaid:e.target.value}))}><option>Não</option><option>Sim</option></select></label>
              {/consórcio/i.test(resolvedProduct(details))&&<label>Parcelas da comissão<input type="number" min="1" max="120" value={details.commissionInstallments||"1"} onChange={e=>setDetails(x=>({...x,commissionInstallments:e.target.value}))}/><output>Valor por parcela: {brl((operationValueForDetails(details)*(Number(String(details.commissionRate||"0").replace(",","."))/100))/Math.max(1,Number(details.commissionInstallments||1)))}</output></label>}
              <label>{details.commissionPaid==="Sim"?"Data do recebimento":"Primeiro vencimento das receitas"}<input required={Boolean(details.commissionRate||details.adhesionFee||details.advisoryFee)} type="date" value={details.commissionDueDate||""} onChange={e=>setDetails(x=>({...x,commissionDueDate:e.target.value}))}/></label>
              <label>Possui nota fiscal?<select value={details.invoiceRequired||"Não"} onChange={e=>setDetails(x=>({...x,invoiceRequired:e.target.value}))}><option>Não</option><option>Sim</option></select></label>
              {details.invoiceRequired==="Sim"&&<><label>Número da nota fiscal<input required value={details.invoiceNumber||""} onChange={e=>setDetails(x=>({...x,invoiceNumber:e.target.value}))} placeholder="Ex.: 000123"/></label><label>Valor da nota fiscal<CurrencyInput required inputMode="decimal" value={details.invoiceValue||""} onChange={nextValue=>setDetails(x=>({...x,invoiceValue:nextValue}))}  placeholder="R$ 0,00"/></label><label>Data de emissão<input required type="date" value={details.invoiceIssuedAt||""} onChange={e=>setDetails(x=>({...x,invoiceIssuedAt:e.target.value}))}/></label><label>Nota fiscal paga?<select value={details.invoicePaid||"Não"} onChange={e=>setDetails(x=>({...x,invoicePaid:e.target.value}))}><option>Não</option><option>Sim</option></select></label></>}
              <label>Telefone<input required inputMode="tel" maxLength={15} value={details.phone||""} onChange={e=>setDetails(x=>({...x,phone:maskPhone(e.target.value)}))} placeholder="(88) 99999-9999"/></label>
              <label>Pós-venda<select required value={details.postSale||"Pendente"} onChange={e=>setDetails(x=>({...x,postSale:e.target.value}))}><option>Pendente</option><option>Agendado</option><option>Concluído</option><option>Não se aplica</option></select></label>
              <label className="tf-form-full">Observações do pós-venda<textarea value={details.postSaleNotes||""} onChange={e=>setDetails(x=>({...x,postSaleNotes:e.target.value}))} placeholder="Registre orientações, retorno ou acompanhamento necessário."/></label>
            </div>}
            <div className="tf-final-sections">
              <section className="tf-final-section">
                <header><small>01</small><h3>Dados do cliente</h3></header>
                <div className="tf-form-grid">
                  <label>Nome<input required value={details.name||""} onChange={e=>setDetails(x=>({...x,name:e.target.value}))}/></label>
                  <label>Data do cadastro<input required type="date" value={details.operationDate||""} onChange={e=>setDetails(x=>({...x,operationDate:e.target.value}))}/></label>
                  <label className="tf-document-field">CPF ou benefício<span><select value={details.documentType||"CPF"} onChange={e=>setDetails(x=>({...x,documentType:e.target.value}))}><option>CPF</option><option>Benefício</option></select>{details.documentType==="Benefício"?<input required inputMode="numeric" value={details.benefit||""} onChange={e=>setDetails(x=>({...x,benefit:e.target.value.replace(/[^\d.-]/g,""),cpf:""}))} placeholder="Número do benefício"/>:<input required inputMode="numeric" maxLength={14} value={details.cpf||""} onChange={e=>setDetails(x=>({...x,cpf:maskCpf(e.target.value),benefit:""}))} placeholder="000.000.000-00"/>}</span></label>
                  <label>Data de nascimento<input required inputMode="numeric" maxLength={10} value={details.birthDate||""} onChange={e=>setDetails(x=>({...x,birthDate:maskDate(e.target.value)}))} placeholder="DD/MM/AAAA"/></label>
                </div>
              </section>
              <section className="tf-final-section">
                <header><small>02</small><h3>Dados da operação</h3></header>
                <div className="tf-form-grid">
                  <SmartChoice label="Tipo de contrato" value={details.contractType||resolvedProduct(details)} options={contractTypeOptionsFor(details.agreement||"")} onChange={value=>setDetails(current=>({...current,contractType:value,product:value,operationType:""}))} helper="As opções acompanham o convênio selecionado."/>
                  {/proteção auto/i.test(resolvedProduct(details))&&<label>Valor da tabela FIPE<CurrencyInput required inputMode="decimal" value={details.fipeValue||""} onChange={nextValue=>setDetails(x=>({...x,fipeValue:nextValue}))}  placeholder="R$ 0,00"/></label>}
                  <FinalChoice label="Tipo de operação" field="operationType" details={details} setDetails={setDetails} options={operationOptionsFor(details.contractType||resolvedProduct(details))}/>
                  <SmartChoice label="Convênio" required={false} value={details.agreement||""} options={agreementOptions} onChange={value=>setDetails(current=>({...current,agreement:value,contractType:"",product:"",operationType:""}))} helper="Selecione o convênio ou cadastre um novo."/>
                  <FinalChoice label="Banco / instituição" field="bank" details={details} setDetails={setDetails} options={finalBankOptions}/>
                  <label>Valor do contrato<CurrencyInput required inputMode="decimal" value={details.value||""} onChange={nextValue=>setDetails(x=>({...x,value:nextValue}))}  placeholder="R$ 0,00"/></label>
                  <label>Valor da parcela<CurrencyInput inputMode="decimal" value={details.installment||""} onChange={nextValue=>setDetails(x=>({...x,installment:nextValue}))}  placeholder="R$ 0,00"/></label>
                  {/consórcio/i.test(resolvedProduct(details))&&<><label>Quantidade de cotas<input type="number" min="1" max="999" value={details.quotaQuantity||"1"} onChange={e=>setDetails(x=>({...x,quotaQuantity:e.target.value}))}/></label><label>Valor por cota<CurrencyInput inputMode="decimal" value={details.quotaUnitValue||""} onChange={nextValue=>setDetails(x=>({...x,quotaUnitValue:nextValue}))}  placeholder="R$ 0,00"/><output>Total das cotas: {brl(parseMoneyBr(details.quotaUnitValue)*Math.max(1,Number(details.quotaQuantity||1)))}</output></label></>}
                  <label>Prazo do contrato<input type="number" min="1" value={details.term||""} onChange={e=>setDetails(x=>({...x,term:e.target.value}))} placeholder="Ex.: 84"/></label>
                  <label>Dia do vencimento<input inputMode="numeric" maxLength={2} value={details.dueDay||""} onChange={e=>setDetails(x=>({...x,dueDay:e.target.value.replace(/\D/g,"").slice(0,2)}))} placeholder="Ex.: 10"/></label>
                  <SmartChoice label="Indicador / parceiro" required={false} value={details.productionIndicator||""} options={managedOptions("indicator",["Balcão TF","Indicação direta","Parceiro","Prospecção","WhatsApp",...members.map(member=>member.name)])} catalogKind="indicator" catalogOptions={catalogOptions} onCatalogChange={onCatalogChange} onChange={value=>setDetails(current=>({...current,productionIndicator:value}))} helper="Digite um nome e pressione Enter para cadastrar."/>
                  <SmartChoice label="Promotora" required={false} value={details.promoter==="__other"?details.promoterOther||"":details.promoter||""} options={managedOptions("promoter",finalPromoterOptions)} catalogKind="promoter" catalogOptions={catalogOptions} onCatalogChange={onCatalogChange} onChange={value=>setDetails(current=>({...current,promoter:value,promoterOther:""}))} helper="Digite um nome e pressione Enter para cadastrar."/>
                  <SmartChoice label="Produção / origem / digitação" required value={details.producer||"Balcão TF"} options={managedOptions("production",[...productionSources,user.name,...members.map(member=>member.name)])} catalogKind="production" catalogOptions={catalogOptions} onCatalogChange={onCatalogChange} onChange={value=>setDetails(current=>({...current,producer:value,origin:hasGgCode(value)?"GG Veículos":current.origin||"TF"}))} helper="Código GG mantém o espelhamento do parceiro."/>
                  <SmartChoice label="Parceiro / origem" required value={details.origin||"TF"} options={managedOptions("production",["TF","GG Veículos",...partnerNames])} catalogKind="production" catalogOptions={catalogOptions} onCatalogChange={onCatalogChange} onChange={value=>setDetails(current=>({...current,origin:value}))} helper="Não se aplica quando não houver parceiro."/>
                </div>
              </section>
              <section className="tf-final-section">
                <header><small>03</small><h3>Financeiro</h3></header>
                <div className="tf-form-grid">
                  <label>Valor bruto da comissão (%)<select value={details.commissionRate||"0"} onChange={e=>setDetails(x=>({...x,commissionRate:e.target.value}))}>{[0,1,2,3,4,5,6].map(rate=><option key={rate} value={String(rate)}>R{rate} · {rate}%</option>)}</select><output>Comissão calculada: {brl(operationValueForDetails(details)*(Number(String(details.commissionCustomRate||details.commissionRate||0).replace(",","."))/100))}</output></label>
                  <label>Percentual manual (%)<input inputMode="decimal" value={details.commissionCustomRate||""} onChange={e=>setDetails(x=>({...x,commissionCustomRate:e.target.value.replace(/[^\d,.]/g,"")}))} placeholder="Ex.: 2,75"/><output>{details.commissionCustomRate?`Percentual considerado: ${details.commissionCustomRate}%`:"Se preenchido, substitui a opção R."}</output></label>
                  <label>Taxa de adesão<CurrencyInput inputMode="decimal" value={details.adhesionFee||""} onChange={nextValue=>setDetails(x=>({...x,adhesionFee:nextValue}))}  placeholder="R$ 0,00"/></label>
                  <label>Taxa de assessoria<CurrencyInput value={details.advisoryFee||""} onChange={value=>setDetails(x=>({...x,advisoryFee:value}))}/></label>
                  <label>Bonificação<CurrencyInput inputMode="decimal" value={details.bonus||""} onChange={nextValue=>setDetails(x=>({...x,bonus:nextValue}))}  placeholder="R$ 0,00"/></label>
                  <label>Comissão e demais receitas recebidas?<select value={details.commissionPaid||"Não"} onChange={e=>setDetails(x=>({...x,commissionPaid:e.target.value}))}><option>Não</option><option>Sim</option></select></label>
                  <label>{details.commissionPaid==="Sim"?"Data do recebimento":"Agendar recebimento para cobrança"}<input required={Boolean(details.commissionRate||details.commissionCustomRate||details.adhesionFee||details.advisoryFee||details.bonus)} type="date" value={details.commissionDueDate||""} onChange={e=>setDetails(x=>({...x,commissionDueDate:e.target.value}))}/>{details.commissionPaid!=="Sim"&&<small className="tf-field-note">O sistema exibirá um lembrete no dia agendado.</small>}</label>
                  {/consórcio/i.test(resolvedProduct(details))&&<label>Parcelas da comissão<input type="number" min="1" max="120" value={details.commissionInstallments||"1"} onChange={e=>setDetails(x=>({...x,commissionInstallments:e.target.value}))}/><output>Valor por parcela: {brl((operationValueForDetails(details)*(Number(String(details.commissionCustomRate||details.commissionRate||0).replace(",","."))/100))/Math.max(1,Number(details.commissionInstallments||1)))}</output></label>}
                  <label>POSSUI NOTA FISCAL?<select value={details.invoiceRequired||"Não"} onChange={e=>setDetails(x=>({...x,invoiceRequired:e.target.value}))}><option>Sim</option><option>Não</option></select><small className="tf-field-note">A nota será anexada posteriormente no módulo de Notas fiscais.</small></label>
                </div>
              </section>
              <section className="tf-final-section tf-final-status">
                <header><small>04</small><h3>Conclusão</h3></header>
                <div className="tf-form-grid">
                  <label>Situação do contrato<select required value={details.contractStatus||"Finalizado"} onChange={e=>setDetails(x=>({...x,contractStatus:e.target.value}))}><option>Finalizado</option><option>Concluído</option><option>Pendência</option></select></label>
                  <label>Data da conclusão<input required={["Finalizado","Concluído"].includes(details.contractStatus||"Finalizado")} disabled={!(["Finalizado","Concluído"].includes(details.contractStatus||"Finalizado"))} type="date" value={details.paidDate||""} onChange={e=>setDetails(x=>({...x,paidDate:e.target.value}))}/></label>
                </div>
              </section>
            </div>
            <button className="tf-primary" disabled={finalizing}>
              {finalizing ? "Salvando cadastro…" : "Concluir cadastro e finalizar"}
            </button>
          </form>
        </div>
      )}
      {returnDeal&&<div className="tf-modal-back"><form className="tf-modal tf-return-modal" onSubmit={saveReturn}>
        <button type="button" className="tf-modal-close" onClick={()=>setReturnDeal(null)}>×</button>
        <small>ACOMPANHAMENTO DO CLIENTE</small><h2>Agendar retorno</h2><p>{returnDeal.name} · {returnDeal.product}</p>
        <label>Telefone / WhatsApp<input inputMode="tel" maxLength={15} value={returnForm.phone} onChange={e=>setReturnForm(x=>({...x,phone:maskPhone(e.target.value)}))} required/></label>
        <label>Data e horário<input type="datetime-local" value={returnForm.returnAt} onChange={e=>setReturnForm(x=>({...x,returnAt:e.target.value}))} required/></label>
        <label>Motivo do retorno<input value={returnForm.returnReason} onChange={e=>setReturnForm(x=>({...x,returnReason:e.target.value}))} placeholder="Ex.: confirmar documentação" required/></label>
        <label>O que foi conversado<textarea value={returnForm.returnNotes} onChange={e=>setReturnForm(x=>({...x,returnNotes:e.target.value}))} placeholder="Registre as observações da conversa" required/></label>
        <button className="tf-primary">Salvar retorno</button>
      </form></div>}
      {historyDeal&&<div className="tf-modal-back"><div className="tf-modal tf-history-modal">
        <button type="button" className="tf-modal-close" onClick={()=>setHistoryDeal(null)}>×</button>
        <small>HISTÓRICO DO CLIENTE</small><h2>{historyDeal.name}</h2><p>CPF {formatCpf(historyDeal.cpf)} · {historyDeal.product}</p>
        <div className="tf-history-list">{(historyDeal.history||[]).slice().reverse().map((h,i)=><article key={i}><i><History/></i><div><b>{h.type==='retorno_concluido'?'Retorno concluído':'Retorno agendado'}</b><small>{new Date(h.at).toLocaleString('pt-BR')}</small><p>{h.conversation||h.reason||'Sem observações'}</p>{h.returnAt&&<em>Próximo contato: {new Date(h.returnAt).toLocaleString('pt-BR')}</em>}</div></article>)}{!(historyDeal.history||[]).length&&<p className="tf-no-history">Nenhum registro de conversa ainda.</p>}</div>
      </div></div>}
      {showReturns&&<div className="tf-modal-back"><div className="tf-modal tf-modal-wide tf-returns-modal">
        <button type="button" className="tf-modal-close" onClick={()=>setShowReturns(false)}>×</button>
        <small>RETORNOS DO DIA E ATRASADOS</small><h2>Clientes para atender</h2>
        <div className="tf-returns-list">{todayReturns.map(d=><article key={d.id} className={d.returnAt!<nowIso?'overdue':''}><header><div><b>{d.name}</b><small>{formatPhone(d.phone)} · CPF {formatCpf(d.cpf)} · {d.product}</small></div><em>{d.returnAt!<nowIso?'ATRASADO':'HOJE'} · {new Date(d.returnAt!).toLocaleString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</em></header><p><b>Última conversa:</b> {d.lastConversation||d.returnNotes||'Sem observações'}</p><p><b>Motivo:</b> {d.returnReason}</p><div className="tf-resume-flow"><label>Reiniciar o atendimento em<select value={resumeStages[d.id]||'atendimento'} onChange={e=>setResumeStages(s=>({...s,[d.id]:e.target.value}))}>{columns.filter(([stage])=>stage!=='finalizado').map(([stage,name])=><option key={stage} value={stage}>{name}</option>)}</select></label><button className="tf-primary" onClick={()=>resumeFlow(d)}>Reiniciar fluxo</button></div><footer><button disabled={!digits(d.phone)} onClick={()=>window.open(`https://wa.me/55${digits(d.phone)}`,'_blank')}><MessageCircle/> WhatsApp</button><button disabled={!digits(d.phone)} onClick={()=>{window.location.href=`tel:${digits(d.phone)}`}}><Phone/> Ligar</button><button onClick={()=>setHistoryDeal(d)}><History/> Histórico</button><a href={calendarUrl(d)} target="_blank" rel="noreferrer"><CalendarDays/> Google Agenda</a><button onClick={()=>completeReturn(d)}><CheckCircle2/> Concluir sem retornar</button><button onClick={()=>openReturn(d)}><Clock3/> Reagendar</button></footer></article>)}</div>
      </div></div>}
      {confirmAction && (
        <div
          className="tf-modal-back tf-action-confirm-back"
          role="presentation"
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) setConfirmAction(null);
          }}
        >
          <div className="tf-action-confirm" role="dialog" aria-modal="true">
            <button
              type="button"
              className="tf-modal-close"
              aria-label="Fechar confirmação"
              onClick={() => setConfirmAction(null)}
            >
              ×
            </button>
            <span className={confirmAction.permanent ? "tf-confirm-icon danger" : "tf-confirm-icon"}>
              {confirmAction.permanent ? "!" : "i"}
            </span>
            <small>{confirmAction.permanent ? "EXCLUSÃO DEFINITIVA" : "CANCELAMENTO"}</small>
            <h2>
              {confirmAction.permanent
                ? "Excluir este atendimento?"
                : "Cancelar este atendimento?"}
            </h2>
            <p>
              {confirmAction.permanent
                ? `O atendimento de ${confirmAction.deal.name} será removido do Kanban e não poderá ser recuperado.`
                : `O atendimento de ${confirmAction.deal.name} será cancelado e retirado do Kanban ativo.`}
            </p>
            <div className="tf-action-confirm-buttons">
              <button type="button" className="tf-secondary" onClick={() => setConfirmAction(null)}>
                Manter atendimento
              </button>
              <button
                type="button"
                className={confirmAction.permanent ? "tf-danger" : "tf-primary"}
                onClick={() => remove(confirmAction.deal, confirmAction.permanent)}
              >
                {confirmAction.permanent ? "Excluir definitivamente" : "Confirmar cancelamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
const operationDatabaseId=(row:Operation)=>row.dbId||((row.id>=20_000_000)?row.id-20_000_000:0);
function partnerOperationCalculation(row:Operation,partner:PartnerRecord){
  const operationId=operationDatabaseId(row),adjustment=partner.adjustments?.find(item=>item.operationId===operationId);
  return {operationId,...partnerFinance(row.grossCommission,adjustment?.ilaRate??row.ilaRate,adjustment?.invoiceRate??row.invoiceRate,adjustment?.tfShare??row.tfShare)};
}
function pdfEsc(value:string){
  const normalized=value.replace(/[–—−]/g,"-").replace(/…/g,"...").replace(/[“”]/g,'"').replace(/[‘’]/g,"'");
  let result="";
  for(const char of normalized){
    const code=char.charCodeAt(0);
    if(char==="("||char===")"||char==="\\")result+=`\\${char}`;
    else if(code>=32&&code<=126)result+=char;
    else if(code<=255)result+=`\\${code.toString(8).padStart(3,"0")}`;
    else result+="?";
  }
  return result;
}
function pdfFit(value:string,max:number){
  return value.length<=max?value:`${value.slice(0,Math.max(1,max-3))}...`;
}
function downloadPartnerReportPdf({partnerName,monthLabel,status,production,calculatedGross,net,tfValue,previousMonthLabel,previousProduction,previousCount,currentCount,previousTicket,currentTicket,variationLabel,analysis,rows,clientsData,partner,bonus}:{partnerName:string;monthLabel:string;status:string;production:number;calculatedGross:number;net:number;tfValue:number;previousMonthLabel:string;previousProduction:number;previousCount:number;currentCount:number;previousTicket:number;currentTicket:number;variationLabel:string;analysis:string;rows:Operation[];clientsData:Client[];partner:PartnerRecord;bonus:number}){
  const W=595,H=842,cmd:string[]=[],gold=[.66,.45,.19],dark=[.08,.10,.08],muted=[.36,.38,.35],green=[.12,.48,.25];
  const color=(rgb:number[])=>`${rgb.join(" ")} rg`,stroke=(rgb:number[])=>`${rgb.join(" ")} RG`;
  const text=(x:number,top:number,size:number,value:string,bold=false,rgb=dark)=>cmd.push(`BT /${bold?"F2":"F1"} ${size} Tf ${color(rgb)} ${x.toFixed(2)} ${(H-top).toFixed(2)} Td (${pdfEsc(value)}) Tj ET`);
  const rect=(x:number,top:number,w:number,h:number,fill:number[],border?:number[])=>{cmd.push(`${color(fill)} ${x} ${(H-top-h).toFixed(2)} ${w} ${h} re f`);if(border)cmd.push(`${stroke(border)} .6 w ${x} ${(H-top-h).toFixed(2)} ${w} ${h} re S`)};
  const line=(x1:number,y1:number,x2:number,y2:number,rgb=gold,width=1)=>cmd.push(`${stroke(rgb)} ${width} w ${x1.toFixed(2)} ${(H-y1).toFixed(2)} m ${x2.toFixed(2)} ${(H-y2).toFixed(2)} l S`);
  rect(0,0,W,H,[1,1,1]);
  text(22,29,8,"TF ASSESSORIA E FINANCAS",true,gold);text(22,48,18,"Relatorio de parceiro",true,dark);text(22,65,10,partnerName,true,dark);text(22,80,8,monthLabel,false,muted);line(22,91,573,91,gold,1.4);
  rect(458,25,115,30,status==="pago"?[.88,.96,.90]:[.98,.94,.84],status==="pago"?[.35,.65,.43]:gold);text(474,44,7,status==="pago"?"RELATORIO PAGO":"EM ABERTO",true,status==="pago"?green:gold);
  const cards=[['VALOR FINANCIADO',brl(production)],['COMISSAO BRUTA',brl(calculatedGross)],['COMISSAO LIQUIDA',brl(net)],['REPASSE THIAGO - 50%',brl(tfValue)]];
  cards.forEach(([label,value],index)=>{const x=22+index*139;rect(x,105,132,43,index===3?[.91,.96,.92]:[.96,.95,.92],[.84,.80,.70]);text(x+8,119,5.8,label,true,muted);text(x+8,139,10,value,true,index===3?green:gold)});
  text(22,171,7,"COMPARATIVO MENSAL",true,gold);text(22,187,12,"Producao total",true,dark);text(485,185,11,variationLabel,true,variationLabel.startsWith("+")?green:[.68,.20,.18]);
  const comparison=[{x:22,title:previousMonthLabel,value:previousProduction,count:previousCount,ticket:previousTicket},{x:213,title:monthLabel,value:production,count:currentCount,ticket:currentTicket}];
  comparison.forEach((item,index)=>{rect(item.x,199,181,55,index?[.98,.95,.88]:[.95,.95,.94],index?gold:[.75,.76,.73]);text(item.x+8,213,6,pdfFit(item.title,28),true,muted);text(item.x+8,232,11,brl(item.value),true,index?gold:dark);text(item.x+8,246,5.8,`${item.count} contratos  |  Ticket medio ${brl(item.ticket)}`,false,muted)});
  rect(404,199,169,55,[.97,.95,.89],gold);text(416,214,6,variationLabel.startsWith("+")?"CRESCIMENTO":"REDUCAO",true,gold);text(416,234,14,variationLabel,true,dark);text(416,247,5.8,`${brl(Math.abs(production-previousProduction))} de diferenca`,false,muted);
  rect(22,266,551,76,[.985,.98,.96],[.84,.82,.77]);text(31,280,6,"EVOLUCAO DO PERIODO",true,muted);
  const graphLeft=40,graphTop=294,graphW=515,graphH=34,points=[previousProduction,production],max=Math.max(1,...points),p1={x:graphLeft,y:graphTop+graphH-(previousProduction/max)*graphH},p2={x:graphLeft+graphW,y:graphTop+graphH-(production/max)*graphH};
  line(graphLeft,graphTop+graphH,graphLeft+graphW,graphTop+graphH,[.82,.82,.80],.5);line(p1.x,p1.y,p2.x,p2.y,gold,2.2);cmd.push(`${color(gold)} ${p1.x-2} ${(H-p1.y-2).toFixed(2)} 4 4 re f`);cmd.push(`${color(gold)} ${p2.x-2} ${(H-p2.y-2).toFixed(2)} 4 4 re f`);text(graphLeft,338,5.5,pdfFit(previousMonthLabel,22),false,muted);text(graphLeft+graphW-70,338,5.5,pdfFit(monthLabel,22),false,muted);
  rect(22,351,551,37,[.97,.96,.93],[.84,.82,.77]);text(31,365,6,"ANALISE DO PERIODO",true,gold);text(31,379,6,pdfFit(analysis,155),false,dark);
  const headers=['Cliente','CPF','Banco','Produto','Valor','Bruta','ILA','Apos ILA','Nota','Liquida','Repasse TF'],widths=[75,50,42,55,49,46,48,49,46,48,43],tableTop=402,available=415,totalRows=Math.max(1,rows.length+(bonus>0?1:0)),rowH=Math.max(6.1,Math.min(14,(available-18)/totalRows)),fontSize=Math.max(3.6,Math.min(6,rowH*.43));
  let x=22;headers.forEach((header,index)=>{rect(x,tableTop,widths[index],18,[.12,.13,.12]);text(x+2,tableTop+12,5.2,header,true,[1,1,1]);x+=widths[index]});
  const tableRows=rows.map(row=>{const client=clientsData.find(item=>item.id===row.clientId),calculation=partnerOperationCalculation(row,partner);return [client?.name||'Cliente',formatCpf(client?.cpf||''),row.bank,row.product,brl(row.value),brl(calculation.gross),`${calculation.ilaRate.toLocaleString('pt-BR')}% ${brl(calculation.ilaValue)}`,brl(calculation.afterIla),`${calculation.invoiceRate.toLocaleString('pt-BR')}% ${brl(calculation.invoiceFee)}`,brl(calculation.net),brl(calculation.thiagoShare)]});
  if(bonus>0)tableRows.push(['Campanha GG Veiculos','-','Seguro','Bonificacao','-','-','0%','-','0%',brl(bonus),brl(partnerAdditionalFinance(bonus).thiagoShare)]);
  if(!tableRows.length)tableRows.push(['Nenhuma operacao no periodo.','','','','','','','','','','']);
  tableRows.forEach((cells,rowIndex)=>{const top=tableTop+18+rowIndex*rowH;x=22;cells.forEach((cell,index)=>{rect(x,top,widths[index],rowH,rowIndex%2?[.975,.975,.968]:[1,1,1],[.88,.88,.86]);const maxChars=Math.max(4,Math.floor(widths[index]/(fontSize*.52)));text(x+2,top+rowH*.68,fontSize,pdfFit(String(cell),maxChars),index===0,dark);x+=widths[index]})});
  text(22,832,5.5,`Gerado em ${new Date().toLocaleDateString('pt-BR')} - Gestao TF`,false,muted);text(515,832,5.5,"Pagina 1 de 1",false,muted);
  const content=cmd.join("\n"),objects=["",`<< /Type /Catalog /Pages 2 0 R >>`,`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`];
  let pdf="%PDF-1.4\n",offsets=[0];for(let index=1;index<objects.length;index++){offsets[index]=pdf.length;pdf+=`${index} 0 obj\n${objects[index]}\nendobj\n`}const xref=pdf.length;pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;for(let index=1;index<objects.length;index++)pdf+=`${String(offsets[index]).padStart(10,"0")} 00000 n \n`;pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const blob=new Blob([pdf],{type:'application/pdf'}),url=URL.createObjectURL(blob),link=document.createElement('a'),safeName=partnerName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase();link.href=url;link.download=`relatorio-${safeName||'parceiro'}-${monthLabel.replace(/\s+/g,'-').toLowerCase()}.pdf`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function PartnerOperationRow({row,client,partner,onUpdated}:{row:Operation;client?:Client;partner:PartnerRecord;onUpdated:(partner:PartnerRecord)=>void}){
  const initial=partnerOperationCalculation(row,partner),[ilaRate,setIlaRate]=useState(String(initial.ilaRate).replace('.',',')),[invoiceRate,setInvoiceRate]=useState(String(initial.invoiceRate).replace('.',',')),[saving,setSaving]=useState(false),[saved,setSaved]=useState(false),parseRate=(value:string)=>Math.max(0,Math.min(100,Number(value.replace(',','.'))||0));
  const ila=parseRate(ilaRate),invoice=parseRate(invoiceRate),calculation={ila,invoice,...partnerFinance(row.grossCommission,ila,invoice,initial.tfShare)};
  const save=async()=>{if(!initial.operationId)return alert('Este registro histórico precisa ser vinculado a uma operação para salvar as taxas.');setSaving(true);setSaved(false);let id=partner.id;if(!id){const created=await fetch('/api/partners',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:partner.name})}),createdData=await created.json();if(!created.ok){setSaving(false);return alert(createdData.error||'Não foi possível preparar o parceiro.')}id=createdData.partner.id;}const response=await fetch('/api/partners',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id,operationId:initial.operationId,ilaRate:calculation.ila,invoiceRate:calculation.invoice,tfShare:initial.tfShare})}),data=await response.json();setSaving(false);if(!response.ok)return alert(data.error||'Não foi possível salvar as taxas.');onUpdated({...partner,id,adjustments:[data.adjustment,...(partner.adjustments||[]).filter(item=>item.operationId!==initial.operationId)]});setSaved(true);};
  return <div className="tf-partner-operation-row"><span>{client?.name||'Cliente'}</span><span>{formatCpf(client?.cpf||'')}</span><span>{row.bank}</span><span>{row.product}</span><b>{brl(row.value)}</b><b>{brl(calculation.gross)}</b><label><input aria-label={`ILA de ${client?.name||'cliente'}`} inputMode="decimal" value={ilaRate} onChange={event=>{setIlaRate(event.target.value.replace(/[^\d,.]/g,''));setSaved(false)}}/><small>{brl(calculation.ilaValue)}</small></label><b>{brl(calculation.afterIla)}</b><label><input aria-label={`Taxa da nota de ${client?.name||'cliente'}`} inputMode="decimal" value={invoiceRate} onChange={event=>{setInvoiceRate(event.target.value.replace(/[^\d,.]/g,''));setSaved(false)}}/><small>{brl(calculation.invoiceFee)}</small></label><b>{brl(calculation.net)}</b><strong>{brl(calculation.thiagoShare)}</strong><button type="button" onClick={save} disabled={saving||!initial.operationId}>{saving?'Salvando':saved?'Salvo ✓':'Salvar taxas'}</button></div>;
}
function PartnerSettlement({partner,gross,period,rows,previousRows,clientsData,onUpdated}:{partner:PartnerRecord;gross:number;period:string;rows:Operation[];previousRows:Operation[];clientsData:Client[];onUpdated:(partner:PartnerRecord)=>void}){
  const saved=partner.settlements?.find(item=>item.period===period),status=saved?.status||'em_aberto';
  const [saving,setSaving]=useState(false),[bonusSaving,setBonusSaving]=useState(false),[reportOpen,setReportOpen]=useState(false),[bonusDraft,setBonusDraft]=useState(formatMoneyInput(saved?.bonus??0)),[bonusDescription,setBonusDescription]=useState(saved?.bonusDescription||'');
  const bonusTimer=useRef<number|null>(null),draftBonusValue=Math.max(0,parseMoneyBr(bonusDraft)),legacyBonus=partner.bonuses?.filter(item=>item.period===period&&item.source!=='manual').reduce((sum,item)=>sum+item.value,0)||0;
  const calculations=rows.map(row=>partnerOperationCalculation(row,partner)),calculatedGross=calculations.reduce((sum,item)=>sum+item.gross,0),ilaTotal=calculations.reduce((sum,item)=>sum+item.ilaValue,0),afterIlaTotal=calculations.reduce((sum,item)=>sum+item.afterIla,0),invoiceFeeTotal=calculations.reduce((sum,item)=>sum+item.invoiceFee,0),baseNet=calculations.reduce((sum,item)=>sum+item.net,0),bonus=legacyBonus+draftBonusValue,bonusCalculation=partnerAdditionalFinance(bonus),net=baseNet+bonusCalculation.net,tfValue=calculations.reduce((sum,item)=>sum+item.thiagoShare,0)+bonusCalculation.thiagoShare,partnerValue=calculations.reduce((sum,item)=>sum+item.partnerShare,0)+bonusCalculation.partnerShare,production=rows.reduce((sum,row)=>sum+row.value,0),previousProduction=previousRows.reduce((sum,row)=>sum+row.value,0),difference=production-previousProduction,variation=previousProduction?difference/previousProduction*100:production?100:0;
  useEffect(()=>{setBonusDraft(formatMoneyInput(saved?.bonus??0));setBonusDescription(saved?.bonusDescription||'');},[partner.id,period,saved?.bonus,saved?.bonusDescription]);
  useEffect(()=>()=>{if(bonusTimer.current)window.clearTimeout(bonusTimer.current)},[]);
  const formatPartnerMonth=(value:string)=>{const label=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}-01T00:00:00Z`));return label.charAt(0).toUpperCase()+label.slice(1)},monthLabel=formatPartnerMonth(period),[reportYear,reportMonth]=period.split('-').map(Number),previousDate=new Date(Date.UTC(reportYear,reportMonth-2,1)),previousPeriod=`${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth()+1).padStart(2,'0')}`,previousMonthLabel=formatPartnerMonth(previousPeriod),combinedProduction=production+previousProduction,previousShare=combinedProduction?Math.round(previousProduction/combinedProduction*100):0,currentShare=Math.max(0,100-previousShare),variationLabel=`${variation>=0?'+':'−'}${Math.abs(variation).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`,analysis=difference>=0?`A produção aumentou ${brl(Math.abs(difference))} (${Math.abs(variation).toLocaleString('pt-BR',{maximumFractionDigits:1})}%) em relação ao mês anterior. Mantenha o ritmo e priorize os produtos com melhor conversão.`:`A produção caiu ${brl(Math.abs(difference))} (${Math.abs(variation).toLocaleString('pt-BR',{maximumFractionDigits:1})}%) em relação ao mês anterior. Reforce a oferta de financiamento e acompanhe os clientes em negociação.`;
  const trendDays=[1,5,10,15,20,25,31],cumulativeAt=(items:Operation[],day:number)=>items.filter(item=>Number(item.date.slice(8,10))<=day).reduce((sum,item)=>sum+item.value,0),previousTrend=trendDays.map(day=>cumulativeAt(previousRows,day)),currentTrend=trendDays.map(day=>cumulativeAt(rows,day)),trendMax=Math.max(1,...previousTrend,...currentTrend),trendPoint=(value:number,index:number)=>({x:48+index*(624/(trendDays.length-1)),y:222-(value/trendMax)*172}),previousTrendPoints=previousTrend.map(trendPoint),currentTrendPoints=currentTrend.map(trendPoint),trendLine=(points:{x:number;y:number}[])=>points.map((point,index)=>`${index?'L':'M'} ${point.x} ${point.y}`).join(' '),trendArea=(points:{x:number;y:number}[])=>`${trendLine(points)} L ${points.at(-1)!.x} 224 L ${points[0].x} 224 Z`,currentTicket=rows.length?production/rows.length:0,previousTicket=previousRows.length?previousProduction/previousRows.length:0;
  const updateStatus=async(nextStatus:string)=>{setSaving(true);let id=partner.id;if(!id){const created=await fetch('/api/partners',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:partner.name})}),createdData=await created.json();if(!created.ok){setSaving(false);return alert(createdData.error||'Não foi possível preparar o parceiro.')}id=createdData.partner.id;}const response=await fetch('/api/partners',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id,period,status:nextStatus,grossCommission:calculatedGross})}),data=await response.json();setSaving(false);if(response.ok)onUpdated({...partner,id,settlements:[{...data.settlement,bonus:draftBonusValue,bonusDescription:bonusDescription.trim()},...(partner.settlements||[]).filter(item=>item.period!==period)]});else alert(data.error||'Não foi possível atualizar o relatório.');};
  const persistBonus=async(value:number,description:string)=>{if(bonusTimer.current)window.clearTimeout(bonusTimer.current);setBonusSaving(true);let id=partner.id;if(!id){const created=await fetch('/api/partners',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:partner.name})}),createdData=await created.json();if(!created.ok){setBonusSaving(false);alert(createdData.error||'Não foi possível preparar o parceiro.');return false}id=createdData.partner.id;}const response=await fetch('/api/partners',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id,period,bonus:Math.max(0,value),bonusDescription:description,grossCommission:calculatedGross})}),data=await response.json();setBonusSaving(false);if(!response.ok){alert(data.error||'Não foi possível salvar o adicional.');return false}const manualBonus=value>0?{period,value,description:description||'Bônus / campanha adicional',source:'manual' as const}:null;onUpdated({...partner,id,settlements:[data.settlement,...(partner.settlements||[]).filter(item=>item.period!==period)],bonuses:[...(manualBonus?[manualBonus]:[]),...(partner.bonuses||[]).filter(item=>!(item.source==='manual'&&item.period===period))]});setBonusDraft(formatMoneyInput(value));setBonusDescription(description);notifyCrmChanged();return true;};
  const scheduleBonusSave=(value:string,description=bonusDescription)=>{if(bonusTimer.current)window.clearTimeout(bonusTimer.current);bonusTimer.current=window.setTimeout(()=>void persistBonus(Math.max(0,parseMoneyBr(value)),description.trim()),650)};
  const saveBonus=async()=>{await persistBonus(draftBonusValue,bonusDescription.trim())};
  const removeBonus=async()=>{if(status==='pago'&&!window.confirm('Este acerto já está pago. Remover o valor adicional e recalcular o rateio?'))return;setBonusDraft('');setBonusDescription('');await persistBonus(0,'');};
  const exportReport=()=>setReportOpen(true);
  return <><section className="tf-partner-settlement"><header><span><small>ACERTO DA PARCERIA · {period}</small><h3>Comissão líquida e repasse</h3></span><strong>{brl(tfValue)}<small> repasse do Thiago · 50%</small></strong></header><section className="tf-partner-additional"><header><span><small>ADICIONAL DO PERÍODO</small><h4>Valor adicional / bonificação de campanha</h4></span><small>Digite, altere ou apague. O rateio acompanha o valor atual.</small></header><div><label>Valor adicional<CurrencyInput aria-label="Valor adicional de bônus ou campanha" value={bonusDraft} onChange={value=>{if(status==='pago'&&draftBonusValue>0&&parseMoneyBr(value)===0&&!window.confirm('Este acerto já está pago. Remover o valor adicional e recalcular o rateio?')){setBonusDraft(formatMoneyInput(draftBonusValue));return}setBonusDraft(value);scheduleBonusSave(value)}}/></label><label>Descrição<input value={bonusDescription} onChange={event=>{setBonusDescription(event.target.value);scheduleBonusSave(bonusDraft,event.target.value)}} onBlur={()=>scheduleBonusSave(bonusDraft,bonusDescription)} maxLength={160} placeholder="Ex.: Campanha de seguro"/></label><button type="button" className="tf-primary" onClick={saveBonus} disabled={bonusSaving}>{bonusSaving?'Salvando…':'Salvar adicional'}</button>{draftBonusValue>0&&<button type="button" className="tf-remove-additional" onClick={removeBonus} disabled={bonusSaving}>Remover valor adicional</button>}</div></section><div className="tf-partner-settlement-values"><span><small>COMISSÃO BRUTA</small><b>{brl(calculatedGross)}</b></span><span><small>ILA DESCONTADO</small><b>{brl(ilaTotal)}</b></span><span><small>APÓS ILA</small><b>{brl(afterIlaTotal)}</b></span>{bonus>0&&<span><small>BÔNUS / CAMPANHA</small><b>{brl(bonus)}</b></span>}<span><small>TAXA DA NOTA</small><b>{brl(invoiceFeeTotal)}</b></span><span><small>COMISSÃO LÍQUIDA</small><b>{brl(net)}</b></span><span><small>PARTE DO PARCEIRO</small><b>{brl(partnerValue)}</b></span></div><footer><em className={status==='pago'?'done':'pending'}>{status==='pago'?'Relatório pago':'Em aberto'}</em><button type="button" className="tf-partner-export" onClick={exportReport}>Abrir relatório</button><button type="button" className="tf-primary" onClick={()=>updateStatus(status==='pago'?'em_aberto':'pago')} disabled={saving}>{saving?'Salvando…':status==='pago'?'Reabrir mês':'Marcar mês como pago'}</button></footer></section>{reportOpen&&createPortal(<div className="tf-partner-report-overlay" onMouseDown={()=>setReportOpen(false)}><section className="tf-partner-report" onMouseDown={event=>event.stopPropagation()}><header><div><small>RELATÓRIO DE PARCEIRO</small><h2>{partner.name}</h2><p>{monthLabel}</p></div><span className={status==='pago'?'done':'pending'}>{status==='pago'?'RELATÓRIO PAGO':'EM ABERTO'}</span><button type="button" aria-label="Fechar relatório" onClick={()=>setReportOpen(false)}><X/></button></header><div className="tf-partner-report-cards"><article><small>VALOR FINANCIADO</small><b>{brl(production)}</b></article><article><small>COMISSÃO BRUTA</small><b>{brl(calculatedGross)}</b></article><article><small>COMISSÃO LÍQUIDA</small><b>{brl(net)}</b></article><article><small>REPASSE THIAGO · 50%</small><b>{brl(tfValue)}</b></article></div><section className="tf-partner-report-comparison tf-partner-trend-comparison"><header><div><small>COMPARATIVO MENSAL</small><h3>Produção total</h3></div><b className={difference>=0?"up":"down"}>{variationLabel}</b></header><div className="tf-partner-trend-cards"><article><small>{previousMonthLabel}</small><strong>{brl(previousProduction)}</strong><span><b>{previousRows.length}</b> contratos</span><span><b>{brl(previousTicket)}</b> ticket médio</span></article><article className="current"><small>{monthLabel}</small><strong>{brl(production)}</strong><span><b>{rows.length}</b> contratos</span><span><b>{brl(currentTicket)}</b> ticket médio</span></article><aside><small>{difference>=0?"CRESCIMENTO":"REDUÇÃO"}</small><strong>{variationLabel}</strong><span>{difference>=0?"+":"−"} {brl(Math.abs(difference))} de diferença</span></aside></div><div className="tf-partner-trend-chart"><svg viewBox="0 0 720 270" role="img" aria-label={"Evolução da produção de "+previousMonthLabel+" e "+monthLabel}><defs><linearGradient id="tf-partner-current-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e7b94f" stopOpacity=".62"/><stop offset="1" stopColor="#e7b94f" stopOpacity="0"/></linearGradient><linearGradient id="tf-partner-previous-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d7d9d6" stopOpacity=".34"/><stop offset="1" stopColor="#d7d9d6" stopOpacity="0"/></linearGradient><filter id="tf-partner-line-glow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>{[50,93,136,179,222].map(y=><line key={y} className="tf-partner-trend-grid" x1="48" x2="672" y1={y} y2={y}/>)}{trendDays.map((day,index)=><g key={day}><line className="tf-partner-trend-grid vertical" x1={trendPoint(0,index).x} x2={trendPoint(0,index).x} y1="50" y2="224"/><text className="tf-partner-trend-day" x={trendPoint(0,index).x} y="250">{String(day).padStart(2,"0")}</text></g>)}<path className="tf-partner-trend-area previous" d={trendArea(previousTrendPoints)}/><path className="tf-partner-trend-area current" d={trendArea(currentTrendPoints)}/><path className="tf-partner-trend-line previous" d={trendLine(previousTrendPoints)}/><path className="tf-partner-trend-line current" d={trendLine(currentTrendPoints)}/><circle className="tf-partner-trend-dot previous" cx={previousTrendPoints.at(-1)!.x} cy={previousTrendPoints.at(-1)!.y} r="6"/><circle className="tf-partner-trend-dot current" cx={currentTrendPoints.at(-1)!.x} cy={currentTrendPoints.at(-1)!.y} r="7"/></svg><div className="tf-partner-trend-legend"><span><i className="current"/>{monthLabel}<b>{brl(production)}</b></span><span><i className="previous"/>{previousMonthLabel}<b>{brl(previousProduction)}</b></span></div></div></section><article className="tf-partner-report-analysis"><b>Análise do período</b><p>{analysis}</p></article><div className="tf-partner-report-table"><table><thead><tr><th>Cliente</th><th>CPF</th><th>Banco</th><th>Produto</th><th>Valor financiado</th><th>Comissão bruta</th><th>ILA aplicado</th><th>Após ILA</th><th>Taxa da nota</th><th>Líquida</th><th>Repasse Thiago</th></tr></thead><tbody>{rows.map((row,index)=>{const client=clientsData.find(item=>item.id===row.clientId),calculation=partnerOperationCalculation(row,partner);return <tr className={`tone-${index%5}`} key={row.id}><td>{client?.name||'Cliente'}</td><td>{formatCpf(client?.cpf||'')}</td><td>{row.bank}</td><td>{row.product}</td><td>{brl(row.value)}</td><td>{brl(calculation.gross)}</td><td>{calculation.ilaRate.toLocaleString('pt-BR')}% · {brl(calculation.ilaValue)}</td><td>{brl(calculation.afterIla)}</td><td>{calculation.invoiceRate.toLocaleString('pt-BR')}% · {brl(calculation.invoiceFee)}</td><td>{brl(calculation.net)}</td><td>{brl(calculation.thiagoShare)}</td></tr>})}{bonus>0&&<tr className="tone-4"><td>Campanha GG Veículos</td><td>—</td><td>Adicional</td><td>{bonusDescription||partner.bonuses?.filter(item=>item.period===period).map(item=>item.description).filter(Boolean).join(' · ')||'Bônus / campanha'}</td><td>—</td><td>—</td><td>0%</td><td>—</td><td>0%</td><td>{brl(bonus)}</td><td>{brl(bonusCalculation.thiagoShare)}</td></tr>}{!rows.length&&<tr><td colSpan={11}>Nenhuma operação no período.</td></tr>}</tbody></table></div><footer><button type="button" onClick={()=>setReportOpen(false)}>Fechar</button><button type="button" className="tf-primary" onClick={()=>downloadPartnerReportPdf({partnerName:partner.name,monthLabel,status,production,calculatedGross,net,tfValue,previousMonthLabel,previousProduction,previousCount:previousRows.length,currentCount:rows.length,previousTicket,currentTicket,variationLabel,analysis,rows,clientsData,partner,bonus})}>Gerar PDF</button></footer></section></div>,document.body)}</>;
}

function Partners({rows,clientsData,partners,onPartnerCreated,onPartnerUpdated}:{rows:Operation[];clientsData:Client[];partners:PartnerRecord[];onPartnerCreated:(partner:PartnerRecord)=>void;onPartnerUpdated:(partner:PartnerRecord)=>void}) {
  const [adding,setAdding]=useState(false),[partnerName,setPartnerName]=useState(""),[expandedPartner,setExpandedPartner]=useState<number|null>(null),[selectedMonth,setSelectedMonth]=useState("2026-09");
  const partnerAccessLink=(id:number)=>typeof window==='undefined'?`/signin-with-chatgpt?return_to=%2Fgermano%3Fpartner%3D${id}`:`${window.location.origin}/signin-with-chatgpt?return_to=${encodeURIComponent(`/germano?partner=${id}`)}`;
  const copyPartnerLink=async(id:number)=>{const link=partnerAccessLink(id);try{await navigator.clipboard.writeText(link);alert('Link do parceiro copiado.')}catch{alert(link)}};
  const savePartner=async(event:React.FormEvent)=>{event.preventDefault();const response=await fetch('/api/partners',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:partnerName})}),data=await response.json();if(response.ok){onPartnerCreated(data.partner);notifyCrmChanged();setPartnerName("");setAdding(false)}else alert(data.error||'Não foi possível cadastrar o parceiro.');};
  const storedPeriods=partners.flatMap(partner=>[...(partner.settlements||[]).map(item=>item.period),...(partner.bonuses||[]).map(item=>item.period)]),monthOptions=Array.from(new Set([...rows.map(row=>row.date.slice(0,7)).filter(value=>/^\d{4}-\d{2}$/.test(value)),...storedPeriods,"2026-09"])).sort((a,b)=>b.localeCompare(a)),monthLabel=(period:string)=>{const label=new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${period}-01T00:00:00Z`));return label.charAt(0).toUpperCase()+label.slice(1)},previousMonth=(()=>{const [year,month]=selectedMonth.split('-').map(Number),date=new Date(Date.UTC(year,month-2,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`})();
  return (
    <>
      <Title
        over="REDE COMERCIAL"
        title="Parceiros"
        text="Produção, clientes e comissões de cada parceiro."
        action="Novo parceiro"
        onAction={()=>setAdding(true)}
      />
      <section className="tf-partner-month"><label>MÊS DO RELATÓRIO<select value={selectedMonth} onChange={event=>setSelectedMonth(event.target.value)}>{monthOptions.map(period=><option key={period} value={period}>{monthLabel(period)}</option>)}</select></label></section>
      <div className="tf-partner-list">{partners.map(partner=>{const partnerName=partner.name;
        const partnerRows=rows.filter(row=>row.partnerId===partner.id||row.origin?.localeCompare(partnerName,"pt-BR",{sensitivity:"base"})===0),currentRows=partnerRows.filter(row=>row.date.startsWith(selectedMonth)),previousRows=partnerRows.filter(row=>row.date.startsWith(previousMonth));
        const clientIds=Array.from(new Set(currentRows.map(row=>row.clientId))),partnerClients=clientIds.map(id=>clientsData.find(client=>client.id===id)).filter(Boolean) as Client[],currentValue=currentRows.reduce((sum,row)=>sum+row.value,0),currentCommission=currentRows.reduce((sum,row)=>sum+row.grossCommission,0),initials=partnerName.split(/\s+/).slice(0,2).map(word=>word[0]).join("").toUpperCase(),expanded=expandedPartner===partner.id;
        return <article className={`tf-partner-executive${expanded?' expanded':''}`} key={partnerName}><header><span><i className={/GG Veículos/i.test(partnerName)?"tf-partner-logo":""}>{/GG Veículos/i.test(partnerName)?<img src="/gg-veiculos-logo.png" alt="GG Veículos"/>:initials}</i><span><h2>{partnerName}</h2><small>Parceiro comercial · {monthLabel(selectedMonth)}</small></span></span><button type="button" className="tf-partner-expand" aria-expanded={expanded} onClick={()=>setExpandedPartner(expanded?null:partner.id)}><span>{partnerClients.length} clientes · {brl(currentValue)}</span><ChevronRight/></button><div className="tf-partner-access-actions">{partner.id>0?<><button type="button" onClick={()=>copyPartnerLink(partner.id)}><Copy/> Copiar link</button><a href={partnerAccessLink(partner.id)} target="_blank" rel="noreferrer"><ExternalLink/> Abrir acesso</a></>:<small>Link disponível após o cadastro</small>}</div></header>{expanded&&<><div className="tf-partner-body"><section className="tf-partner-metrics"><div><small>CLIENTES NO MÊS</small><strong>{partnerClients.length}</strong></div><div><small>VALOR FINANCIADO</small><strong>{brl(currentValue)}</strong></div><div><small>COMISSÃO BRUTA</small><strong>{brl(currentCommission)}</strong></div><div className="tf-partner-detail-table"><header><span>Cliente</span><span>CPF</span><span>Banco</span><span>Produto</span><span>Valor financiado</span><span>Comissão bruta</span><span>ILA % / desconto</span><span>Após ILA</span><span>Nota % / desconto</span><span>Líquida</span><span>Repasse Thiago</span><span>Ação</span></header>{currentRows.map(row=><PartnerOperationRow key={`${row.id}:${partner.adjustments?.find(item=>item.operationId===row.dbId)?.ilaRate}:${partner.adjustments?.find(item=>item.operationId===row.dbId)?.invoiceRate}`} row={row} client={clientsData.find(item=>item.id===row.clientId)} partner={partner} onUpdated={onPartnerUpdated}/>) }{!currentRows.length&&<p>Nenhuma operação vinculada neste mês.</p>}</div></section></div><PartnerSettlement partner={partner} gross={currentCommission} period={selectedMonth} rows={currentRows} previousRows={previousRows} clientsData={clientsData} onUpdated={onPartnerUpdated}/></>}</article>;
      })}</div>
      {adding&&<div className="tf-modal-back"><form className="tf-modal tf-partner-modal" onSubmit={savePartner}><button type="button" className="tf-modal-close" onClick={()=>setAdding(false)}>×</button><small>NOVO PARCEIRO</small><h2>Cadastrar parceiro</h2><p>Informe o nome que deverá aparecer nos relatórios e nas operações.</p><label>Nome do parceiro<input autoFocus required value={partnerName} onChange={event=>setPartnerName(event.target.value)} placeholder="Ex.: Nome da empresa"/></label><div className="tf-modal-actions"><button type="button" className="tf-secondary" onClick={()=>setAdding(false)}>Cancelar</button><button className="tf-primary">Cadastrar parceiro</button></div></form></div>}
    </>
  );
}
function Services({rows}:{rows:Operation[]}) {
  return (
    <>
      <Title
        over="PORTFÓLIO TF"
        title="Serviços"
        text="Produtos, taxas e instituições disponíveis."
      />
      <div className="tf-service-grid tf-market-services">
        {serviceCatalog.map((service) => {const Icon=service.icon,serviceRows=rows.filter(row=>productionProducts.find(product=>product.name===service.name)?.match(row.product)),production=serviceRows.reduce((sum,row)=>sum+row.value,0),commission=serviceRows.reduce((sum,row)=>sum+row.commission,0);return (
          <article key={service.name} className={`tone-${service.tone}`}>
            <header><i><Icon/></i><em>{serviceRows.length} {serviceRows.length===1?'operação':'operações'}</em></header>
            <h2>{service.name}</h2>
            <p>Produção {brl(production)} · Comissão {brl(commission)}</p>
            <ul>{service.subtopics.map(topic=><li key={topic}>{topic}</li>)}</ul>
            <div className="tf-service-live-total"><span>Produção registrada</span><strong>{brl(production)}</strong></div>
          </article>
        )})}
      </div>
    </>
  );
}
function Commissions({
  total,
  rows,
  clientsData,
}: {
  total: number;
  rows: Operation[];
  clientsData: Client[];
}) {
  return (
    <>
      <Title
        over="GESTÃO DE RECEITAS"
        title="Comissões"
        text="Valores previstos, recebidos e divergentes."
      />
      <section className="tf-metrics compact">
        <Metric
          icon="◷"
          label="Previstas"
          value={brl(total)}
          note={`${rows.length} ${rows.length===1?'operação':'operações'}`}
        />
        <Metric
          icon="✓"
          label="Recebidas no mês"
          value={brl(rows.reduce((sum,row)=>sum+row.commissionReceived,0))}
          note="Valores recebidos"
        />
        <Metric
          icon="!"
          label="A receber"
          value={brl(rows.reduce((sum,row)=>sum+row.commissionPending,0))}
          note="Valores pendentes"
        />
      </section>
      <section className="tf-panel">
        <PanelTitle over="LANÇAMENTOS" title="Comissões recentes" />
        <div className="tf-commission">
          {rows.map((o) => (
            <div key={o.id}>
              <span>
                <b>{clientsData.find((c) => c.id === o.clientId)?.name}</b>
                <small>
                  {o.bank} · {o.product}
                </small>
              </span>
              <span>
                <small>Operação</small>
                {brl(o.value)}
              </span>
              <span>
                <small>Comissão</small>
                <strong>{brl(o.commission)}</strong>
              </span>
              <em className={o.commissionPaid ? "done" : "pending"}>
                {o.commissionPaid ? "Recebida" : "A receber"}
              </em>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
function Finance({ rows }: { rows:Operation[] }) {
  const [selectedMonth,setSelectedMonth]=useState("2026-09");
  const monthOptions=Array.from(new Set([...rows.map(o=>o.date.slice(0,7)).filter(value=>/^\d{4}-\d{2}$/.test(value)),"2026-09"])).sort((a,b)=>b.localeCompare(a));
  const monthName=(period:string)=>{const label=new Intl.DateTimeFormat("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${period}-01T00:00:00Z`));return label.charAt(0).toUpperCase()+label.slice(1)};
  const previousMonth=(()=>{const [year,month]=selectedMonth.split("-").map(Number),date=new Date(Date.UTC(year,month-2,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`})();
  const selectedRows=rows.filter(o=>o.date.startsWith(selectedMonth)),previousRows=rows.filter(o=>o.date.startsWith(previousMonth));
  const selectedTotal=selectedRows.reduce((s,o)=>s+o.value,0),selectedCommission=selectedRows.reduce((s,o)=>s+o.commission,0),paidCommission=selectedRows.reduce((s,o)=>s+o.commissionReceived,0),pendingCommission=selectedRows.reduce((s,o)=>s+o.commissionPending,0);
  const periods=[{period:previousMonth,label:monthName(previousMonth),rows:previousRows},{period:selectedMonth,label:monthName(selectedMonth),rows:selectedRows}].map(item=>({...item,value:item.rows.reduce((s,o)=>s+o.value,0),commission:item.rows.reduce((s,o)=>s+o.commission,0)})),max=Math.max(1,...periods.flatMap(x=>[x.value,x.commission]));
  return (
    <>
      <Title
        over="VISÃO FINANCEIRA"
        title="Financeiro / Comissões"
        text={`Produção e comissões de ${monthName(selectedMonth)}.`}
        action="Novo lançamento"
      />
      <section className="tf-finance-month-picker"><label>MÊS DE REFERÊNCIA<select value={selectedMonth} onChange={event=>setSelectedMonth(event.target.value)}>{monthOptions.map(period=><option key={period} value={period}>{monthName(period)}</option>)}</select></label></section>
      <section className="tf-metrics compact">
        <Metric
          icon="↗"
          label="Comissões registradas"
          value={brl(selectedCommission)}
          note={monthName(selectedMonth)}
        />
        <Metric
          icon="✓"
          label="Comissões pagas"
          value={brl(paidCommission)}
          note="Valores já recebidos"
        />
        <Metric
          icon="◷"
          label="A receber"
          value={brl(pendingCommission)}
          note="Comissões pendentes"
        />
        <Metric
          icon="◇"
          label="Volume produzido"
          value={brl(selectedTotal)}
          note="Operações vinculadas"
        />
      </section>
      <section className="tf-panel tf-finance-comparison">
        <PanelTitle
          over="COMPARATIVO"
          title="Produção e comissões por mês"
        />
        <div className="tf-finance-performance">{periods.map((period,index)=>{
          const productionWidth=period.value>0?Math.max(4,period.value/max*100):0,commissionWidth=period.commission>0?Math.max(4,period.commission/max*100):0,rate=period.value>0?period.commission/period.value*100:0;
          return <article className={index===periods.length-1?"current":""} key={period.label}>
            <header><span><small>{index===periods.length-1?"MÊS ATUAL":"MÊS ANTERIOR"}</small><b>{period.label}</b></span><em>{index===periods.length-1?"Atual":"Comparativo"}</em></header>
            <div className="tf-finance-track production"><div><span><i/>Produção</span><strong>{brl(period.value)}</strong></div><span className="tf-finance-rail"><i style={{width:`${productionWidth}%`}}/></span></div>
            <div className="tf-finance-track commission"><div><span><i/>Comissões</span><strong>{brl(period.commission)}</strong></div><span className="tf-finance-rail"><i style={{width:`${commissionWidth}%`}}/></span></div>
            <footer><span>Comissão sobre a produção</span><b>{rate.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})}%</b></footer>
          </article>;
        })}</div>
      </section>
      <section className="tf-panel"><PanelTitle over={monthName(selectedMonth).toUpperCase()} title="Comissões registradas"/><div className="tf-commission">{selectedRows.map(o=><div key={o.id}><span><b>{o.product}</b><small>{o.bank} · {fmt(o.date)}</small></span><span><small>Operação</small>{brl(o.value)}</span><span><small>Comissão</small><strong>{brl(o.commission)}</strong></span><em className={o.commissionPaid?"done":"pending"}>{o.commissionPaid?"Paga":"A receber"}</em></div>)}{!selectedRows.length&&<div className="tf-table-empty"><h2>Nenhum lançamento em {monthName(selectedMonth)}</h2><p>Os novos registros aparecerão aqui automaticamente.</p></div>}</div>
      </section>
    </>
  );
}
function Invoices({invoices}:{invoices:InvoiceRecord[]}) {
  const periods=Array.from(new Set([...invoices.map(invoice=>invoice.issuedAt.slice(0,7)).filter(period=>/^\d{4}-\d{2}$/.test(period)),new Date().toISOString().slice(0,7)])).sort((a,b)=>b.localeCompare(a)),[period,setPeriod]=useState(periods[0]||new Date().toISOString().slice(0,7)),rows=invoices.filter(invoice=>invoice.issuedAt.startsWith(period)),paid=rows.filter(invoice=>/paga/i.test(invoice.status)),pending=rows.filter(invoice=>!/paga/i.test(invoice.status)),periodName=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${period}-01T00:00:00Z`));
  return (
    <>
      <Title
        over="DOCUMENTOS FISCAIS"
        title="Notas fiscais"
        text="Emissão, pagamento e arquivos PDF/XML."
      />
      <section className="tf-panel">
        <div className="tf-filters">
          <button className="active">{periodName} · {rows.length}</button>
          <button>Pagas · {paid.length}</button>
          <button>Pendentes · {pending.length}</button>
          <span />
          <label className="tf-invoice-period">MÊS E ANO<select value={period} onChange={event=>setPeriod(event.target.value)}>{periods.map(item=><option key={item} value={item}>{new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${item}-01T00:00:00Z`))}</option>)}</select></label>
        </div>
        {rows.length?<div className="tf-invoices">{rows.map(invoice=><div key={invoice.id}><b>NF {invoice.number}</b><span><strong>{invoice.clientName}</strong><small>{invoice.partnerName||'TF Assessoria e Finanças'}</small></span><b>{brl(invoice.value)}</b><em className={/paga/i.test(invoice.status)?'done':'pending'}>{/paga/i.test(invoice.status)?'Paga':'Pendente'}</em><span>{invoice.issuedAt?fmt(invoice.issuedAt):'Sem data'}</span></div>)}</div>:<div className="tf-table-empty"><ReceiptText/><h2>Nenhuma nota fiscal em {periodName}</h2><p>Quando uma operação finalizada possuir nota fiscal, ela aparecerá aqui automaticamente.</p></div>}
      </section>
    </>
  );
}
function Banks() {
  return (
    <>
      <Title
        over="CENTRAL DE ACESSOS"
        title="Bancos e financiamentos"
        text="Bancos, promotoras e plataformas de trabalho."
        action="Cadastrar acesso"
      />
      <div className="tf-bank-grid">
        <section className="tf-panel">
          <PanelTitle over="GRUPOS DE TRABALHO" title="Abrir vários acessos" />
          {[
            "Consignado INSS · 4 bancos",
            "Financiamento de veículos · 5 bancos",
            "Seguros · 3 plataformas",
          ].map((x) => (
            <button className="tf-group" key={x}>
              <span>
                <b>{x.split(" · ")[0]}</b>
                <small>{x.split(" · ")[1]}</small>
              </span>
              <i>↗</i>
            </button>
          ))}
        </section>
        <section className="tf-banks">
          <header className="tf-bank-catalog-heading"><span><small>CÓDIGO COMPE</small><b>CÓDIGO — BANCO</b></span><small>Centrais mantidas em fonte oficial</small></header>
          {bankCatalog.map((bank) => (
            <article key={bank.code}>
              <i style={{ background: bank.color }}>{bank.code}</i>
              <span>
                <b>{bank.code} — {bank.name}</b>
                <small>{bank.service || "Instituição financeira"}{bank.phone ? ` · ${bank.phone}` : " · Central no site oficial"}</small>
              </span>
              <em>Ativo</em>
              <a href={bank.officialUrl} target="_blank" rel="noreferrer" aria-label={`Abrir atendimento oficial de ${bank.name}`}><ExternalLink /></a>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}

function postSaleMessage(task: PostSaleTask, googleReviewUrl: string) {
  const name = task.clientName.split(/\s+/)[0] || task.clientName;
  const bank = bankInfo(task.bank);
  const central = bank?.phone ? `Central oficial ${task.bank}: ${bank.phone}` : `Canal oficial ${task.bank}: ${bank?.officialUrl || "consulte o site oficial da instituição"}`;
  const details = `${task.product} · ${task.bank}\nValor: ${brl(task.value)}${task.installment > 0 ? `\nParcela: ${brl(task.installment)}` : ""}${task.term > 0 ? `\nPrazo: ${task.term} meses` : ""}`;
  let guidance = "Se precisar de alguma orientação sobre a operação, continuo à disposição.";
  if (/financiamento/i.test(task.product)) guidance = "Parabéns pela conquista do seu veículo ou bem! Guarde o contrato e acompanhe as parcelas pelos canais oficiais.";
  else if (/garantia/i.test(task.product)) guidance = "Guarde o contrato e acompanhe as condições da operação pelos canais oficiais da instituição.";
  else if (/consignado|inss|clt/i.test(task.product)) guidance = "Acompanhe o desconto no contracheque ou benefício e procure a central oficial em caso de dúvida.";
  else if (/consórcio/i.test(task.product)) guidance = "Acompanhe sua cota e as assembleias pelos canais oficiais da administradora.";
  else if (/juríd/i.test(task.product)) guidance = task.postSaleNotes || "O escritório responsável poderá orientar você sobre os próximos passos.";
  else if (task.postSaleNotes) guidance = task.postSaleNotes;
  return `Olá, ${name}! Aqui é o Thiago, responsável pelo seu atendimento na TF Assessoria & Finanças.\n\nPassando para agradecer pela confiança e informar que sua operação foi concluída com sucesso. 🎉\n\n${details}\n\n${guidance}\n\n${central}\n\nCaso precise de alguma orientação, continuo à disposição.${googleReviewUrl ? `\n\nSe puder, avalie também como foi o meu atendimento:\n${googleReviewUrl}` : ""}\n\nMuito obrigado pela confiança!\nThiago Oliveira\nTF Assessoria & Finanças`;
}

function PostSales({ tasks, setTasks, googleReviewUrl }: { tasks: PostSaleTask[]; setTasks: React.Dispatch<React.SetStateAction<PostSaleTask[]>>; googleReviewUrl: string }) {
  const [filter, setFilter] = useState<"pendente" | "todos">("pendente");
  const pending = tasks.filter((task) => task.status === "pendente");
  const visible = filter === "pendente" ? pending : tasks;
  const complete = async (task: PostSaleTask) => {
    const response = await fetch('/api/post-sales', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: task.id, status: 'concluido' }) });
    const data = await response.json();
    if (response.ok) setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: 'concluido', completedAt: data.task?.completedAt || Date.now() } : item));
    else alert(data.error || 'Não foi possível concluir o pós-venda.');
  };
  return <>
    <Title over="RELACIONAMENTO APÓS A VENDA" title="Pós-venda" text="Acompanhe os contatos que precisam ser feitos depois da conclusão." />
    <section className="tf-post-sale-summary"><article><small>PENDÊNCIAS</small><strong>{pending.length}</strong><span>contatos aguardando</span></article><article><small>HISTÓRICO</small><strong>{tasks.length}</strong><span>operações acompanhadas</span></article><div><button className={filter === "pendente" ? "active" : ""} onClick={() => setFilter("pendente")}>Pendentes · {pending.length}</button><button className={filter === "todos" ? "active" : ""} onClick={() => setFilter("todos")}>Histórico · {tasks.length}</button></div></section>
    <section className="tf-post-sale-list">{visible.map((task) => <article key={task.id} className={task.status === "concluido" ? "completed" : "pending"}>
      <header><span><i><MessageCircle /></i><div><b>{task.clientName}</b><small>{formatPhone(task.phone)} · {task.partner}</small></div></span><em>{task.status === "pendente" ? "Pendente" : "Concluído"}</em></header>
      <div className="tf-post-sale-details"><span><small>PRODUTO</small><b>{task.product}</b></span><span><small>BANCO / INSTITUIÇÃO</small><BankIdentity value={task.bank} compact /></span><span><small>VALOR</small><b>{brl(task.value)}</b></span><span><small>PARCELA</small><b>{task.installment > 0 ? brl(task.installment) : "—"}</b></span><span><small>PRAZO</small><b>{task.term > 0 ? `${task.term} meses` : "—"}</b></span><span><small>CONCLUSÃO</small><b>{formatDateBr(task.completionDate)}</b></span></div>
      {task.postSaleNotes && <p className="tf-post-sale-note">{task.postSaleNotes}</p>}
      <footer><a className="tf-post-sale-whatsapp" href={task.phone ? `https://wa.me/55${phoneKey(task.phone)}?text=${encodeURIComponent(postSaleMessage(task, googleReviewUrl))}` : undefined} target="_blank" rel="noreferrer" aria-disabled={!task.phone}><MessageCircle /> WhatsApp</a>{task.status === "pendente" ? <button className="tf-primary" onClick={() => complete(task)}><CheckCircle2 /> Pós-venda concluído com sucesso</button> : <span className="tf-post-sale-completed"><CheckCircle2 /> Concluído em {task.completedAt ? new Date(task.completedAt).toLocaleString("pt-BR") : "—"}</span>}</footer>
    </article>)}{!visible.length && <div className="tf-table-empty"><CheckCircle2 /><h2>{filter === "pendente" ? "Nenhum pós-venda pendente" : "Nenhum pós-venda registrado"}</h2><p>Quando uma operação for concluída, ela aparecerá nesta fila.</p></div>}</section>
  </>;
}
function ReportsFiltered({
  rows: operations,
  clientsData,
}: {
  rows: Operation[];
  clientsData: Client[];
}) {
  const [client, setClient] = useState("all"),
    [product, setProduct] = useState("all"),
    [from, setFrom] = useState("2026-09-01"),
    [to, setTo] = useState("2026-09-30"),
    [reportKind,setReportKind]=useState("production"),
    [groupBy,setGroupBy]=useState("product");
  const rows = operations.filter(
    (o) =>
      (client === "all" || String(o.clientId) === client) &&
      (product === "all" || o.product === product) &&
      (!from || o.date >= from) &&
      (!to || o.date <= to),
  );
  const total = rows.reduce((s, o) => s + o.value, 0),
    comm = rows.reduce((s, o) => s + o.commission, 0);
  const clientTotal=new Set(rows.map(o=>o.clientId)).size;
  const groupLabel=(o:Operation)=>groupBy==="day"?fmt(o.date):groupBy==="month"?o.date.slice(0,7):groupBy==="year"?o.date.slice(0,4):groupBy==="client"?(clientsData.find(c=>c.id===o.clientId)?.name||"Cliente"):o.product;
  const grouped=[...rows.reduce((map,o)=>{const label=groupLabel(o),current=map.get(label)||{label,count:0,value:0,commission:0};current.count++;current.value+=o.value;current.commission+=o.commission;map.set(label,current);return map},new Map<string,{label:string;count:number;value:number;commission:number}>()).values()].sort((a,b)=>a.label.localeCompare(b.label,"pt-BR",{sensitivity:"base"}));
  const exportCsv = () => {
    const csv = [
      "Cliente,CPF,Produto,Banco,Data,Valor,Comissão",
      ...rows.map((o) => {
        const c = clientsData.find((x) => x.id === o.clientId);
        return [
          c?.name,
          c?.cpf,
          o.product,
          o.bank,
          fmt(o.date),
          brl(o.value),
          brl(o.commission),
        ]
          .map((v) => `"${String(v || "").replaceAll('"', '""')}"`)
          .join(",");
      }),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "relatorio-tf.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <Title
        over="INTELIGÊNCIA COMERCIAL"
        title="Relatórios"
        text="Consulte clientes, operações e comissões por período."
      />
      <section className="tf-report-filters tf-panel">
        <label>
          Tipo de relatório
          <select value={reportKind} onChange={e=>setReportKind(e.target.value)}><option value="production">Produção completa</option><option value="clients">Quantidade de clientes</option><option value="commission">Comissões</option><option value="service">Serviços e produtos</option></select>
        </label>
        <label>
          Agrupar por
          <select value={groupBy} onChange={e=>setGroupBy(e.target.value)}><option value="client">Cliente</option><option value="day">Dia</option><option value="month">Mês</option><option value="product">Produto / serviço</option><option value="year">Ano</option></select>
        </label>
        <label>
          Cliente
          <select value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="all">Todos os clientes</option>
            {[...clientsData].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR",{sensitivity:"base"})).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo de operação
          <select value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="all">Todos os produtos</option>
            {[...new Set(operations.map((o) => o.product))].sort((a,b)=>a.localeCompare(b,"pt-BR",{sensitivity:"base"})).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          De
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button className="tf-primary" onClick={exportCsv}>
          ⇩ Exportar relatório
        </button>
      </section>
      <section className="tf-report-summary">
        <div><small>CLIENTES NO RESULTADO</small><b>{clientTotal}</b></div>
        <div>
          <small>OPERAÇÕES ENCONTRADAS</small>
          <b>{rows.length}</b>
        </div>
        <div>
          <small>VALOR PRODUZIDO</small>
          <b>{brl(total)}</b>
        </div>
        <div>
          <small>COMISSÕES</small>
          <b>{brl(comm)}</b>
        </div>
      </section>
      <section className="tf-panel tf-report-groups"><PanelTitle over="VISÃO AGRUPADA" title={`Resumo por ${groupBy==="product"?"produto":groupBy}`}/><div>{grouped.map(item=><article key={item.label}><span><b>{item.label}</b><small>{item.count} {item.count===1?"operação":"operações"}</small></span><strong>{reportKind==="commission"?brl(item.commission):reportKind==="clients"?String(new Set(rows.filter(o=>groupLabel(o)===item.label).map(o=>o.clientId)).size):brl(item.value)}</strong></article>)}</div></section>
      <section className="tf-panel">
        <PanelTitle over="RESULTADO" title="Detalhamento" />
        <div className="tf-op-table">
          {rows.map((o) => (
            <div key={o.id}>
              <span>
                <b>
                  {clientsData.find((c) => c.id === o.clientId)?.name || "Cliente"}
                </b>
                <small>
                  {o.product} · {o.bank}
                </small>
              </span>
              <span>
                <b>{fmt(o.date)}</b>
                <small>Comissão {brl(o.commission)}</small>
              </span>
              <strong>{brl(o.value)}</strong>
              <em className="done">{o.status}</em>
            </div>
          ))}
          {!rows.length && (
            <div className="tf-table-empty">
              <h2>Nenhum registro encontrado</h2>
              <p>Ajuste os filtros para gerar outro relatório.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
const permissionLabels:Record<string,string>={inicio:'Início',clientes:'Clientes',atendimento:'Atendimento / Kanban',producao:'Produção',parceiros:'Parceiros',servicos:'Serviços',financeiro:'Financeiro / Comissões',notas:'Notas fiscais',bancos:'Bancos e financiamentos',relatorios:'Relatórios',posvenda:'Pós-venda'};
function AccessManagement({members,setMembers,partners}:{members:TeamMember[];setMembers:React.Dispatch<React.SetStateAction<TeamMember[]>>;partners:PartnerRecord[]}){
 const accessUrl=typeof window==='undefined'?'/signin-with-chatgpt':`${window.location.origin}/signin-with-chatgpt`;
 const empty={id:0,name:'',email:'',password:'',active:true,permissions:['inicio','atendimento'] as View[],partnerId:null as number|null};
 const [form,setForm]=useState<TeamMember>(empty),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[copied,setCopied]=useState(false),[lastInvite,setLastInvite]=useState<TeamMember|null>(null);
 const save=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setMessage('');const editing=Boolean(form.id);const r=await fetch('/api/access-users',{method:editing?'PATCH':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(form)});const x=await r.json();setSaving(false);if(!r.ok){setMessage(x.error||'Não foi possível salvar.');return}setMembers(xs=>editing?xs.map(m=>m.id===x.member.id?x.member:m):[x.member,...xs]);setLastInvite(x.member);setForm(empty);setMessage('Acesso salvo. Compartilhe o link e a senha com o usuário.')};
 const toggleActive=async(member:TeamMember)=>{const r=await fetch('/api/access-users',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...member,active:!member.active})});const x=await r.json();if(r.ok)setMembers(xs=>xs.map(m=>m.id===x.member.id?x.member:m))};
 const deleteMember=async(member:TeamMember)=>{if(!window.confirm(`Excluir o acesso de ${member.name}? O histórico será preservado e o login será revogado.`))return;const r=await fetch(`/api/access-users?id=${member.id}`,{method:'DELETE'}),x=await r.json();if(r.ok)setMembers(xs=>xs.map(m=>m.id===x.member.id?x.member:m));else setMessage(x.error||'Não foi possível excluir o usuário.')};
 const copyAccessLink=async()=>{try{await navigator.clipboard.writeText(accessUrl);setCopied(true);setTimeout(()=>setCopied(false),2200)}catch{setMessage(`Link de acesso: ${accessUrl}`)}};
 const visiblePermissions=(member:TeamMember)=>member.permissions.filter(p=>p!=='inicio').map(p=>permissionLabels[p]).filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}));
 return <><Title over="EQUIPE E SEGURANÇA" title="Usuários e acessos" text="Cadastre funcionários ou parceiros e envie o link do sistema." action="Novo acesso" onAction={()=>setForm(empty)}/><section className="tf-access-layout"><div className="tf-access-list"><header><div><small>USUÁRIOS CADASTRADOS</small><h2>Equipe e parceiros</h2></div><b>{members.filter(m=>m.active).length} ativos</b></header>{[...members].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'})).map((member,index)=>{const permissions=visiblePermissions(member),partnerName=partners.find(partner=>partner.id===member.partnerId)?.name||member.partnerName;return <article key={member.id} className={`${!member.active?'inactive ':''}member-tone-${index%6}`}><i>{member.name.split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase()}</i><div><b>{member.name}</b><small>{member.email}</small><p>{partnerName?`Parceiro · ${partnerName}`:permissions.length?permissions.join(' · '):'Somente acesso básico'}</p></div><em>{member.active?'Ativo':'Pausado'}</em><button onClick={()=>setForm({...member,password:''})}>Editar</button><button onClick={()=>toggleActive(member)}>{member.active?'Pausar':'Reativar'}</button><button className="danger" onClick={()=>deleteMember(member)}>Excluir usuário</button></article>})}{!members.length&&<div className="tf-access-empty"><UserRoundCog/><b>Nenhum subacesso criado</b><small>Cadastre o primeiro acesso ao lado.</small></div>}</div><form className="tf-access-form" onSubmit={save}><small>{form.id?'EDITAR ACESSO':'NOVO ACESSO'}</small><h2>{form.id?form.name:'Cadastrar usuário'}</h2><p>Use qualquer e-mail válido. Selecione um parceiro para limitar o acesso somente à produção dele.</p><div className="tf-access-share"><span><b>Link para entrar no Gestão TF</b><small>Depois de salvar, envie o convite diretamente por e-mail ou copie o link.</small></span><code>{accessUrl}</code><button type="button" onClick={copyAccessLink}><Copy/>{copied?'Link copiado':'Copiar link'}</button>{lastInvite&&<a href={`mailto:${lastInvite.email}?subject=${encodeURIComponent('Seu acesso ao Gestão TF')}&body=${encodeURIComponent(`Olá, ${lastInvite.name}! Seu acesso ao Gestão TF está pronto. Entre por este link: ${accessUrl}`)}`}><Send/>Enviar por e-mail</a>}</div><label>Nome<input required value={form.name} onChange={e=>setForm(x=>({...x,name:e.target.value}))} placeholder="Nome do usuário"/></label><label>E-mail de acesso<input required type="email" value={form.email} onChange={e=>setForm(x=>({...x,email:e.target.value}))} placeholder="nome@empresa.com"/></label><label>{form.id?"Nova senha (opcional)":"Senha de acesso"}<input type="password" autoComplete="new-password" minLength={8} maxLength={256} required={!form.id} value={form.password||''} onChange={e=>setForm(x=>({...x,password:e.target.value}))}/></label><label>Vincular a parceiro<select value={form.partnerId||''} onChange={event=>setForm(current=>({...current,partnerId:event.target.value?Number(event.target.value):null}))}><option value="">Equipe TF · acesso interno</option>{partners.filter(partner=>partner.id>0).map(partner=><option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>{form.partnerId?<div className="tf-partner-access-note"><ShieldCheck/><span><b>Acesso restrito ao parceiro</b><small>Este usuário verá somente clientes, produção, relatórios e acertos desse parceiro.</small></span></div>:<fieldset><legend>Áreas autorizadas</legend>{Object.entries(permissionLabels).filter(([id])=>id!=='inicio').sort(([,a],[,b])=>a.localeCompare(b,'pt-BR',{sensitivity:'base'})).map(([id,label])=><label key={id}><input type="checkbox" checked={form.permissions.includes(id as View)} onChange={e=>setForm(x=>({...x,permissions:e.target.checked?[...x.permissions,id as View]:x.permissions.filter(p=>p!==id)}))}/><span><b>{label}</b>{id==='atendimento'&&<small>Kanban individual, sem visualizar o seu.</small>}</span></label>)}</fieldset>}{message&&<em>{message}</em>}<footer>{form.id&&<button type="button" onClick={()=>setForm(empty)}>Cancelar</button>}<button className="tf-primary" disabled={saving}>{saving?'Salvando...':'Salvar acesso'}</button></footer></form></section></>;
}

function SettingsPanel({ close, serverAuthenticated }: { close: () => void; serverAuthenticated?: boolean }) {
  const [newTab, setNewTab] = useState(true);
  const [currentPassword,setCurrentPassword]=useState(""),[newPassword,setNewPassword]=useState(""),[passwordMessage,setPasswordMessage]=useState("");
  const [wa, setWa] = useState<any>(null),
    [adminPhone, setAdminPhone] = useState(""),
    [phoneNumberId, setPhoneNumberId] = useState(""),
    [displayPhone, setDisplayPhone] = useState(""),
    [waBusy, setWaBusy] = useState(false),
    [waMessage, setWaMessage] = useState(""),
    [googleReviewUrl, setGoogleReviewUrl] = useState(""),
    [googleMessage, setGoogleMessage] = useState("");
  useEffect(() => {
    setNewTab(localStorage.getItem("tf_open_new_tab") !== "0");
    fetch("/api/whatsapp/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => {
        if (!x) return;
        setWa(x);
        setAdminPhone(x.integration?.adminPhone || "");
        setPhoneNumberId(x.integration?.phoneNumberId || "");
        setDisplayPhone(x.integration?.displayPhone || "");
      })
      .catch(() => {});
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => { if (x) setGoogleReviewUrl(x.googleReviewUrl || ""); })
      .catch(() => {});
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [close]);
  const changeNewTab = () => {
    const next = !newTab;
    setNewTab(next);
    localStorage.setItem("tf_open_new_tab", next ? "1" : "0");
  };
  const changePassword=async(e:React.FormEvent)=>{
    e.preventDefault();setPasswordMessage("");
    if(serverAuthenticated){
      try{
        const response=await fetch('/api/auth/password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({currentPassword,newPassword})});
        const result=await response.json();
        if(!response.ok){setPasswordMessage(result.error||"Não foi possível alterar a senha.");return}
      }catch{setPasswordMessage("Falha de conexão. Tente novamente.");return}
    }else{
      if(currentPassword!==(localStorage.getItem("tf_access_password")||"")){setPasswordMessage("A senha atual não confere.");return}
      if(newPassword.length<8){setPasswordMessage("A nova senha deve ter pelo menos 8 caracteres.");return}
      localStorage.setItem("tf_access_password",newPassword);
    }
    setCurrentPassword("");setNewPassword("");setPasswordMessage("Senha alterada com sucesso.");
  };
  const saveWhatsapp = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setWaBusy(true);
    setWaMessage("");
    const r = await fetch("/api/whatsapp/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminPhone, phoneNumberId, displayPhone }),
    });
    const x = await r.json();
    setWaBusy(false);
    if (r.ok) {
      setWa((old: any) => ({ ...old, integration: { ...x, enabled: 1 } }));
      setWaMessage("Número administrador salvo com segurança.");
    } else setWaMessage(x.error || "Não foi possível salvar.");
  };
  const saveGoogleReview = async (e: React.FormEvent) => {
    e.preventDefault();
    const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ googleReviewUrl }) });
    const data = await response.json();
    setGoogleMessage(response.ok ? 'Link de avaliação salvo.' : (data.error || 'Não foi possível salvar o link.'));
  };
  const dismiss = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  const content = (
    <div
      className="tf-settings-popover dark"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tf-settings-title"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) dismiss(e);
      }}
    >
      <section className="tf-settings-card">
        <button
          type="button"
          className="tf-settings-close"
          aria-label="Fechar configurações"
          onPointerUp={dismiss}
          onClick={dismiss}
        >
          ×
        </button>
        <header className="tf-settings-heading">
          <small>PREFERÊNCIAS</small>
          <h2 id="tf-settings-title">Configurações</h2>
        </header>
        <div className="tf-settings-row">
          <span>
            <b>Modo noturno</b>
            <small>Ativado permanentemente no Gestão TF</small>
          </span>
          <button
            type="button"
            className="tf-switch active"
            role="switch"
            aria-checked="true"
            aria-label="Modo noturno sempre ativado"
            disabled
          >
            <i />
          </button>
        </div>
        <form className="tf-google-review-settings" onSubmit={saveGoogleReview}>
          <header><span><b>Link de avaliação Google</b><small>Será incluído automaticamente nas mensagens de pós-venda.</small></span><Star /></header>
          <input type="url" value={googleReviewUrl} onChange={(event) => setGoogleReviewUrl(event.target.value)} placeholder="https://g.page/r/.../review" />
          {googleMessage && <p>{googleMessage}</p>}
          <button className="tf-primary">Salvar link</button>
        </form>
        <form className="tf-password-settings" onSubmit={changePassword}>
          <header><KeyRound/><span><b>Alterar senha de acesso</b><small>Atualiza a senha usada nesta tela de entrada.</small></span></header>
          <div><label>Senha atual<input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} required/></label><label>Nova senha<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} minLength={8} required/></label></div>
          {passwordMessage&&<p>{passwordMessage}</p>}<button className="tf-primary">Alterar senha</button>
        </form>
        <div className="tf-settings-row">
          <span>
            <b>Abrir links em nova aba</b>
            <small>Mantém o Gestão TF aberto</small>
          </span>
          <button
            type="button"
            className={`tf-switch${newTab ? " active" : ""}`}
            role="switch"
            aria-checked={newTab}
            aria-label="Abrir links em nova aba"
            onClick={changeNewTab}
          >
            <i />
          </button>
        </div>
        <form className="tf-whatsapp-settings" onSubmit={saveWhatsapp}>
          <header>
            <span className="tf-wa-mark">◉</span>
            <div>
              <small>INTEGRAÇÃO OFICIAL</small>
              <h3>Gestor TF no WhatsApp</h3>
              <p>Comandos de texto e voz conectados ao mesmo Kanban.</p>
            </div>
          </header>
          <div className="tf-wa-status">
            <span className={wa?.services?.whatsapp ? "ready" : "pending"}>
              {wa?.services?.whatsapp ? "WhatsApp conectado" : "Credenciais da Meta pendentes"}
            </span>
            <span className={wa?.services?.ai ? "ready" : "pending"}>
              {wa?.services?.ai ? "Voz e IA ativas" : "Chave da IA pendente"}
            </span>
          </div>
          <label>
            Seu WhatsApp administrador
            <input
              inputMode="tel"
              value={adminPhone}
              onChange={(e) => setAdminPhone(e.target.value)}
              placeholder="5588999999999"
              required
            />
            <small>Use DDI + DDD + número. Somente ele poderá alterar o CRM.</small>
          </label>
          <label>
            ID do número na Meta
            <input
              inputMode="numeric"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="Phone Number ID"
              required
            />
          </label>
          <label>
            Número exibido no WhatsApp
            <input
              inputMode="tel"
              value={displayPhone}
              onChange={(e) => setDisplayPhone(e.target.value)}
              placeholder="(88) 99999-9999"
            />
          </label>
          {wa?.webhookUrl && (
            <div className="tf-webhook-box">
              <small>ENDEREÇO DO WEBHOOK</small>
              <code>{wa.webhookUrl}</code>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(wa.webhookUrl)}
              >
                Copiar
              </button>
            </div>
          )}
          {waMessage && <p className="tf-wa-message">{waMessage}</p>}
          <button className="tf-primary" disabled={waBusy}>
            {waBusy ? "Salvando…" : "Salvar integração"}
          </button>
        </form>
        <button
          type="button"
          className="tf-primary tf-settings-done"
          onPointerUp={dismiss}
          onClick={dismiss}
        >
          Concluir
        </button>
      </section>
    </div>
  );
  return createPortal(content, document.body);
}
function ClientSheet({ client, operations, close, refresh }: { client: Client; operations: Operation[]; close: () => void; refresh:()=>void }) {
  const co = operations.filter((o) => o.clientId === client.id),
    sum = co.reduce((s, o) => s + o.value, 0);
  const [clientForm,setClientForm]=useState<Record<string,string>|null>(null),[operationForm,setOperationForm]=useState<{operation:Operation;details:Record<string,string>}|null>(null),[saving,setSaving]=useState(false);
  const saveClient=async(event:React.FormEvent)=>{event.preventDefault();if(!client.dbId||!clientForm)return;setSaving(true);const response=await fetch('/api/records',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({entity:'client',id:client.dbId,details:{...clientForm,birthDate:dateToIso(clientForm.birthDate),phone:maskPhone(clientForm.phone)}})}),data=await response.json();setSaving(false);if(response.ok)refresh();else alert(data.error||'Não foi possível salvar o cliente.');};
  const saveOperation=async(event:React.FormEvent)=>{event.preventDefault();if(!operationForm?.operation.dbId)return;setSaving(true);const d=operationForm.details,total=parseMoneyBr(d.value)||(/consórcio/i.test(d.product||'')?parseMoneyBr(d.quotaUnitValue)*Math.max(1,Number(d.quotaQuantity||1)):0),response=await fetch('/api/records',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({entity:'operation',id:operationForm.operation.dbId,details:{...d,value:total,installment:parseMoneyBr(d.installment),adhesionFee:parseMoneyBr(d.adhesionFee),advisoryFee:parseMoneyBr(d.advisoryFee),bonus:parseMoneyBr(d.bonus),quotaUnitValue:parseMoneyBr(d.quotaUnitValue),fipeValue:parseMoneyBr(d.fipeValue),operationDate:dateToIso(d.operationDate),paidAt:dateToIso(d.paidAt),birthDate:dateToIso(d.birthDate),phone:maskPhone(d.phone),vehicleValue:parseMoneyBr(d.vehicleValue),financedValue:parseMoneyBr(d.financedValue),desiredCredit:parseMoneyBr(d.desiredCredit),downPayment:parseMoneyBr(d.downPayment)}})}),data=await response.json();setSaving(false);if(response.ok)refresh();else alert(data.error||'Não foi possível salvar a operação.');};
  const deleteRecord=async(entity:'client'|'operation',id:number)=>{if(!confirm(entity==='client'?'Excluir este cliente definitivamente? Todos os atendimentos, operações, comissões, notas e documentos vinculados também serão removidos.':'Excluir esta operação dos relatórios e resultados?'))return;const response=await fetch(`/api/records?entity=${entity}&id=${id}`,{method:'DELETE'}),data=await response.json();if(response.ok)refresh();else alert(data.error||'Não foi possível excluir.');};
  const openOperation=(operation:Operation)=>setOperationForm({operation,details:{name:operation.clientName||client.name,document:operation.clientCpf||operation.clientBenefit||client.cpf||client.benefit,birthDate:operation.clientBirthDate?formatDateBr(operation.clientBirthDate):client.birth&&!client.birth.startsWith("1900-")?formatDateBr(client.birth):"",phone:operation.clientPhone||client.phone,promoter:operation.promoter,contractNumber:operation.contractNumber,groupQuota:operation.groupQuota,observations:operation.observations,vehiclePlate:operation.vehiclePlate,vehicleName:operation.vehicleName,vehicleModel:operation.vehicleModel,vehicleYear:String(operation.vehicleYear||""),vehicleValue:formatMoneyInput(operation.vehicleValue),financedValue:formatMoneyInput(operation.financedValue),desiredCredit:formatMoneyInput(operation.desiredCredit),downPayment:formatMoneyInput(operation.downPayment),bank:operation.bank,agreement:operation.agreement||agreementForProduct(operation.product),contractType:operation.contractType||operation.product,product:operation.product,operationType:operation.operationType||'',installment:formatMoneyInput(operation.installment),value:formatMoneyInput(operation.value),quotaQuantity:String(operation.quotaQuantity||1),quotaUnitValue:formatMoneyInput(operation.quotaUnitValue||operation.value),fipeValue:formatMoneyInput(operation.fipeValue),term:String(operation.term||''),dueDay:operation.dueDay||'',status:/finalizado|pago|conclu/i.test(operation.status)?'Finalizado':operation.status,producer:operation.producer,productionIndicator:operation.productionIndicator||'',origin:operation.origin||'TF',operationDate:operation.date,paidAt:operation.paidDate||'',adhesionFee:formatMoneyInput(operation.adhesionFee),advisoryFee:formatMoneyInput(operation.advisoryFee),bonus:formatMoneyInput(operation.bonus),commissionRate:String(operation.commissionRate||''),commissionInstallments:String(operation.commissionInstallments||1),commissionPaid:operation.commissionPaid?'Sim':'Não',revenueDueDate:operation.revenueDueDate||'',postSale:operation.postSale||'',postSaleNotes:operation.postSaleNotes||''}});
  return (
    <div className="tf-sheet-back" onMouseDown={close}>
      <aside className="tf-sheet" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div>
            <small>FICHA ÚNICA DO CLIENTE</small>
            <h2>{client.name}</h2>
            <span>Relacionamento completo com a TF</span>
          </div>
          <div className="tf-client-sheet-actions">{client.dbId&&<><button onClick={()=>setClientForm({name:client.name,document:client.cpf||client.benefit||'',birthDate:formatDateBr(client.birth),phone:formatPhone(client.phone)})}>Editar cliente</button><button className="danger" onClick={()=>deleteRecord('client',client.dbId!)}>Excluir cliente</button></>}<button className="tf-sheet-close" aria-label="Fechar ficha" onClick={close}>×</button></div>
        </header>
        <section className="tf-identity">
          {[
            ["CPF", formatCpf(client.cpf)],
            ["Nº DO BENEFÍCIO", client.benefit&&client.benefit!=="—"?client.benefit:"Não informado"],
            ["NASCIMENTO", client.birth&&!client.birth.startsWith("1900-")?fmt(client.birth):"Não informado"],
            ["TELEFONE", client.phone&&client.phone!=="Não informado"?formatPhone(client.phone):"Não informado"],
          ].map((x) => (
            <div key={x[0]}>
              <small>{x[0]}</small>
              <b>{x[1]}</b>
            </div>
          ))}
        </section>
        <section className="tf-summary">
          <article>
            <small>OPERAÇÕES</small>
            <strong>{co.length}</strong>
          </article>
          <article>
            <small>VALOR HISTÓRICO</small>
            <strong>{brl(sum)}</strong>
          </article>
          <article>
            <small>BANCOS</small>
            <strong>{new Set(co.map((o) => o.bank)).size}</strong>
          </article>
        </section>
        {client.dbId&&!clientForm&&!operationForm&&<ClientDocuments clientId={client.dbId}/>}
        <div className="tf-timeline-title">
          <div>
            <small>RELACIONAMENTO TF</small>
            <h3>Histórico completo de operações</h3>
          </div>
          <button>＋ Operação</button>
        </div>
        <div className="tf-timeline tf-client-operations">
          {co.map((o) => (
            <article key={o.id} className="tf-operation-card">
              <div>
                <header className="tf-operation-card-head">
                  <span>
                    <b>{o.product}</b>
                    <small>{o.operationType||"Operação cadastrada"}</small>
                  </span>
                  <span className="tf-operation-card-state"><time>{o.date&&!o.date.startsWith("1900-")?fmt(o.date):"Data não informada"}</time><em className="done">{/finalizado|pago|conclu/i.test(o.status)?"Finalizado":o.status}</em></span>
                </header>
                <dl>
                  <div>
                    <dt>Banco / instituição</dt>
                    <dd>{o.bank||"Não informado"}</dd>
                  </div>
                  <div><dt>Convênio / contrato</dt><dd>{[o.agreement,o.contractType].filter(Boolean).join(" · ")||"Não informado"}</dd></div>
                  <div>
                    <dt>Valor da operação</dt>
                    <dd>{o.value>0?brl(o.value):"Não informado"}</dd>
                  </div>
                  {/consórcio/i.test(o.product)&&<div><dt>Cotas do consórcio</dt><dd>{o.quotaQuantity?`${o.quotaQuantity} × ${brl(o.quotaUnitValue||o.value/o.quotaQuantity)}`:"Não informado"}</dd></div>}
                  {/proteção auto/i.test(o.product)&&<div><dt>Valor FIPE</dt><dd>{o.fipeValue?brl(o.fipeValue):"Não informado"}</dd></div>}
                  <div>
                    <dt>Parcela / prazo</dt>
                    <dd>{o.installment>0?brl(o.installment):"Não informada"}{o.term>0?` · ${o.term}x`:""}{o.dueDay?` · vence dia ${o.dueDay}`:""}</dd>
                  </div>
                  <div>
                    <dt>Produção</dt>
                    <dd>{[o.producer,o.origin].filter((value,index,list)=>value&&list.indexOf(value)===index).join(" · ")||"Não informada"}</dd>
                  </div>
                  <div>
                    <dt>Comissão</dt>
                    <dd className="tf-money-value">{o.commission>0?`${brl(o.commission)} · ${o.commissionPaid?"Paga":"A receber"}`:"Não informada"}</dd>
                  </div>
                  <div>
                    <dt>Situação do contrato</dt>
                    <dd>{/finalizado|pago|conclu/i.test(o.status)?"Finalizado":o.status||"Não informada"}</dd>
                  </div>
                </dl>
                {o.dbId&&<div className="tf-operation-actions"><button onClick={()=>openOperation(o)}>Editar informações</button><button className="danger" onClick={()=>deleteRecord('operation',o.dbId!)}>Excluir operação</button></div>}
              </div>
            </article>
          ))}
        </div>
      </aside>
      {clientForm&&<div className="tf-modal-back" onMouseDown={event=>event.stopPropagation()}><form className="tf-modal" onSubmit={saveClient}><button type="button" className="tf-modal-close" onClick={()=>setClientForm(null)}>×</button><small>EDITAR CLIENTE</small><h2>Dados cadastrais</h2><label>Nome completo<input required value={clientForm.name} onChange={event=>setClientForm({...clientForm,name:event.target.value})}/></label><label>CPF ou benefício<input required value={clientForm.document} onChange={event=>setClientForm({...clientForm,document:event.target.value})}/></label><label>Data de nascimento<input value={clientForm.birthDate} onChange={event=>setClientForm({...clientForm,birthDate:maskDate(event.target.value)})} placeholder="DD/MM/AAAA"/></label><label>Telefone<input value={clientForm.phone} onChange={event=>setClientForm({...clientForm,phone:maskPhone(event.target.value)})}/></label><button className="tf-primary" disabled={saving}>{saving?'Salvando…':'Salvar cliente'}</button></form></div>}
      {operationForm&&<div className="tf-modal-back" onMouseDown={event=>event.stopPropagation()}><form className="tf-modal tf-modal-wide tf-operation-editor" onSubmit={saveOperation}><button type="button" className="tf-modal-close" onClick={()=>setOperationForm(null)}>×</button><small>EDITAR OPERAÇÃO</small><h2>{client.name}</h2><p>Complete ou corrija qualquer informação desta produção.</p><div className="tf-form-grid">
        <label>Nome do cliente<input required value={operationForm.details.name||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,name:event.target.value}})}/></label>
        <label>CPF ou benefício<input required value={operationForm.details.document||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,document:event.target.value}})}/></label>
        <label>Data de nascimento<input value={operationForm.details.birthDate||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,birthDate:maskDate(event.target.value)}})} placeholder="DD/MM/AAAA"/></label>
        <label>Telefone / WhatsApp<input inputMode="tel" value={operationForm.details.phone||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,phone:maskPhone(event.target.value)}})}/></label>
        <label>Número do contrato<input value={operationForm.details.contractNumber||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,contractNumber:event.target.value}})}/></label>
        <label>Promotora<input value={operationForm.details.promoter||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,promoter:event.target.value}})}/></label>
<SmartChoice label="Banco / instituição" value={operationForm.details.bank||''} options={finalBankOptions} onChange={value=>setOperationForm({...operationForm,details:{...operationForm.details,bank:value}})} helper="Pesquise ou cadastre outra instituição."/><SmartChoice label="Convênio" value={operationForm.details.agreement||''} options={agreementOptions} onChange={value=>setOperationForm({...operationForm,details:{...operationForm.details,agreement:value,contractType:'',product:'',operationType:''}})} helper="Selecione ou cadastre o convênio."/><SmartChoice label="Tipo de contrato" value={operationForm.details.contractType||operationForm.details.product||''} options={contractTypeOptionsFor(operationForm.details.agreement||'')} onChange={value=>setOperationForm({...operationForm,details:{...operationForm.details,contractType:value,product:value,operationType:''}})} helper="As opções acompanham o convênio."/><SmartChoice label="Tipo de operação" value={operationForm.details.operationType||''} options={operationOptionsFor(operationForm.details.contractType||operationForm.details.product||'')} onChange={value=>setOperationForm({...operationForm,details:{...operationForm.details,operationType:value}})} helper="As opções acompanham o tipo de contrato."/>{[
        ['Indicador de produção','productionIndicator']
      ].map(([label,field])=><label key={field}>{label}<input value={operationForm.details[field]||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,[field]:event.target.value}})}/></label>)}
      <label>Produção<select value={operationForm.details.producer||"Balcão TF"} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,producer:event.target.value,origin:hasGgCode(event.target.value)?"GG Veículos":"TF"}})}>{[...new Set([...productionSources,operationForm.details.producer].filter(Boolean))].map(source=><option key={source}>{source}</option>)}</select></label>
      <SmartChoice label="Parceiro / origem" value={operationForm.details.origin||'TF'} options={["TF","GG Veículos"]} onChange={value=>setOperationForm({...operationForm,details:{...operationForm.details,origin:value}})} helper="TF e GG Veículos já estão cadastrados; para outro parceiro, digite o novo nome."/>
      <label>Dia do vencimento<input inputMode="numeric" maxLength={2} value={operationForm.details.dueDay||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,dueDay:event.target.value.replace(/\D/g,'').slice(0,2)}})} placeholder="Ex.: 10"/></label>
      <label>Data do cadastro<input type="date" value={operationForm.details.operationDate||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,operationDate:event.target.value}})}/></label><label>Parcela<CurrencyInput required={/proteção auto/i.test(operationForm.details.product||'')} value={operationForm.details.installment||''} onChange={nextValue=>setOperationForm({...operationForm,details:{...operationForm.details,installment:nextValue}})}/></label>{/consórcio/i.test(operationForm.details.product||'')?<><label>Quantidade de cotas<input type="number" min="1" value={operationForm.details.quotaQuantity||'1'} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,quotaQuantity:event.target.value}})}/></label><label>Valor por cota<CurrencyInput value={operationForm.details.quotaUnitValue||''} onChange={nextValue=>setOperationForm({...operationForm,details:{...operationForm.details,quotaUnitValue:nextValue}})}/><output>Valor total: {brl(parseMoneyBr(operationForm.details.quotaUnitValue)*Math.max(1,Number(operationForm.details.quotaQuantity||1)))}</output></label></>:/proteção auto/i.test(operationForm.details.product||'')?<label>Valor FIPE<CurrencyInput value={operationForm.details.fipeValue||''} onChange={nextValue=>setOperationForm({...operationForm,details:{...operationForm.details,fipeValue:nextValue}})}/><output>Produção do mês: {brl(parseMoneyBr(operationForm.details.installment))}</output></label>:<label>Valor pago / liberado<CurrencyInput required value={operationForm.details.value||''} onChange={nextValue=>setOperationForm({...operationForm,details:{...operationForm.details,value:nextValue}})}/></label>}<label>Prazo<input type="number" value={operationForm.details.term||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,term:event.target.value}})}/></label><label>Situação do contrato<select value={operationForm.details.status||'Finalizado'} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,status:event.target.value}})}><option>Concluído</option><option>Finalizado</option><option>Pendência</option></select></label><label>Data da conclusão<input type="date" value={operationForm.details.paidAt||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,paidAt:event.target.value}})}/></label><label>Taxa de adesão<CurrencyInput value={operationForm.details.adhesionFee||''} onChange={nextValue=>setOperationForm({...operationForm,details:{...operationForm.details,adhesionFee:nextValue}})}/></label><label>Taxa de assessoria<CurrencyInput value={operationForm.details.advisoryFee||''} onChange={value=>setOperationForm({...operationForm,details:{...operationForm.details,advisoryFee:value}})}/></label><label>Comissão (%)<input inputMode="decimal" value={operationForm.details.commissionRate||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,commissionRate:event.target.value.replace(/[^\d,.]/g,'')}})}/><output>Comissão bruta: {brl((/consórcio/i.test(operationForm.details.product||'')?parseMoneyBr(operationForm.details.quotaUnitValue)*Math.max(1,Number(operationForm.details.quotaQuantity||1)):/proteção auto/i.test(operationForm.details.product||'')?parseMoneyBr(operationForm.details.installment):parseMoneyBr(operationForm.details.value))*(Number(String(operationForm.details.commissionRate||'0').replace(',','.'))/100))}</output></label>{/consórcio/i.test(operationForm.details.product||'')&&<label>Parcelas da comissão<input type="number" min="1" max="120" value={operationForm.details.commissionInstallments||'1'} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,commissionInstallments:event.target.value}})}/></label>}<label>Comissão / adesão / assessoria recebidas?<select value={operationForm.details.commissionPaid||'Não'} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,commissionPaid:event.target.value}})}><option>Não</option><option>Sim</option></select></label><label>{operationForm.details.commissionPaid==='Sim'?'Data do recebimento':'Vencimento da receita'}<input required={Boolean(operationForm.details.commissionRate||operationForm.details.adhesionFee||operationForm.details.advisoryFee)} type="date" value={operationForm.details.revenueDueDate||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,revenueDueDate:event.target.value}})}/></label><label>Bonificação<CurrencyInput value={operationForm.details.bonus||''} onChange={value=>setOperationForm({...operationForm,details:{...operationForm.details,bonus:value}})}/></label>
      <label className="tf-form-full">Observações da operação<textarea value={operationForm.details.observations||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,observations:event.target.value}})}/></label>
      <label>Grupo / cota<input value={operationForm.details.groupQuota||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,groupQuota:event.target.value}})}/></label>
      {(/financiamento|garantia|proteção auto/i.test(operationForm.details.product||''))&&<>
        <label>Placa do veículo<input value={operationForm.details.vehiclePlate||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,vehiclePlate:event.target.value}})}/></label>
        <label>Veículo<input value={operationForm.details.vehicleName||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,vehicleName:event.target.value}})}/></label>
        <label>Modelo<input value={operationForm.details.vehicleModel||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,vehicleModel:event.target.value}})}/></label>
        <label>Ano<input inputMode="numeric" value={operationForm.details.vehicleYear||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,vehicleYear:event.target.value}})}/></label>
        <label>Valor do veículo<CurrencyInput value={operationForm.details.vehicleValue||''} onChange={value=>setOperationForm({...operationForm,details:{...operationForm.details,vehicleValue:value}})}/></label>
        <label>Valor financiado<CurrencyInput value={operationForm.details.financedValue||''} onChange={value=>setOperationForm({...operationForm,details:{...operationForm.details,financedValue:value}})}/></label>
        <label>Entrada<CurrencyInput value={operationForm.details.downPayment||''} onChange={value=>setOperationForm({...operationForm,details:{...operationForm.details,downPayment:value}})}/></label>
      </>}
      <label>Crédito desejado<CurrencyInput value={operationForm.details.desiredCredit||''} onChange={value=>setOperationForm({...operationForm,details:{...operationForm.details,desiredCredit:value}})}/></label>
      <label>Pós-venda<select value={operationForm.details.postSale||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,postSale:event.target.value}})}><option value="">Não informado</option><option>Pendente</option><option>Agendado</option><option>Concluído</option><option>Não se aplica</option></select></label><label className="tf-form-full">Observações<textarea value={operationForm.details.postSaleNotes||''} onChange={event=>setOperationForm({...operationForm,details:{...operationForm.details,postSaleNotes:event.target.value}})}/></label></div><button className="tf-primary" disabled={saving}>{saving?'Salvando…':'Salvar alterações'}</button></form></div>}
    </div>
  );
}

type ClientDocument = {
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  documentType: string;
  createdAt: number;
};
function ClientDocuments({ clientId }: { clientId: number }) {
  const [docs, setDocs] = useState<ClientDocument[]>([]),
    [busy, setBusy] = useState(false),
    [type, setType] = useState("identidade");
  useEffect(() => {
    fetch(`/api/client-documents?clientId=${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => x?.documents && setDocs(x.documents))
      .catch(() => {});
  }, [clientId]);
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const f = new FormData();
    f.append("clientId", String(clientId));
    f.append("documentType", type);
    f.append("file", file);
    const r = await fetch("/api/client-documents", { method: "POST", body: f });
    const x = await r.json();
    if (r.ok && x.document) setDocs((d) => [x.document, ...d]);
    else alert(x.error || "Não foi possível anexar o documento.");
    setBusy(false);
    e.target.value = "";
  };
  return (
    <section className="tf-documents">
      <header>
        <div>
          <small>DOCUMENTAÇÃO DO CLIENTE</small>
          <h3>
            <FileText /> Documentos anexados
          </h3>
        </div>
        <label className="tf-upload-button">
          <FileUp /> {busy ? "Enviando…" : "Anexar documento"}
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={upload}
            disabled={busy}
          />
        </label>
      </header>
      <div className="tf-doc-upload-row">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="cnh">CNH</option>
          <option value="comprovante">Comprovante</option>
          <option value="contrato">Contrato</option>
          <option value="cpf">CPF</option>
          <option value="outro">Outro documento</option>
          <option value="identidade">RG / Identidade</option>
        </select>
        <span>PDF, JPG ou PNG · até 4 MB</span>
      </div>
      {docs.length ? (
        <ul>
          {docs.map((d) => (
            <li key={d.id}>
              <FileText />
              <span>
                <a href={`/api/client-documents?id=${d.id}`} target="_blank" rel="noreferrer"><b>{d.fileName}</b></a>
                <small>
                  {d.documentType} · {Math.ceil(d.sizeBytes / 1024)} KB
                </small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tf-doc-empty">Nenhum documento anexado ainda.</p>
      )}
    </section>
  );
}

function QuickDocumentUpload() {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [cpf, setCpf] = useState(""),
    [birthDate, setBirthDate] = useState(""),
    [product, setProduct] = useState("Financiamento"),
    [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await fetch("/api/deals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, cpf: cpfKey(cpf), birthDate: dateToIso(birthDate), product }),
    });
    const x = await r.json();
    setBusy(false);
    if (r.ok) {
      setOpen(false);
      setName("");
      setCpf("");
      setBirthDate("");
      alert("Documento lido. Atendimento iniciado na primeira etapa.");
    } else alert(x.error || "Confira os dados extraídos.");
  };
  return (
    <>
      {
        <button
          type="button"
          className="tf-upload-kanban"
          onClick={() => setOpen(true)}
        >
          <FileUp /> Upload de documento <small>CNH ou identidade</small>
        </button>
      }
      {open && (
        <div className="tf-modal-back">
          <form className="tf-modal" onSubmit={submit}>
            <button
              type="button"
              className="tf-modal-close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <small>INÍCIO RÁPIDO · DOCUMENTO</small>
            <h2>Upload de documento</h2>
            <p>
              Envie a CNH ou identidade e confirme somente os dados necessários
              para iniciar o atendimento.
            </p>
            <label>
              Documento
              <input type="file" accept="image/*,.pdf" required />
            </label>
            <label>
              Primeiro e segundo nome
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Nome do cliente"
              />
            </label>
            <label>
              CPF
              <input
                value={cpf}
                onChange={(e) => setCpf(maskCpf(e.target.value))}
                inputMode="numeric"
                maxLength={14}
                required
                placeholder="000.000.000-00"
              />
            </label>
            <label>
              Data de nascimento
              <input
                inputMode="numeric"
                maxLength={10}
                value={birthDate}
                onChange={(e) => setBirthDate(maskDate(e.target.value))}
                placeholder="DD/MM/AAAA"
                required
              />
            </label>
            <label>
              Produto
              <select
                value={product}
                onChange={(e) => setProduct(e.target.value)}
              >
                {productOptions.map((option)=><option key={option}>{option}</option>)}
              </select>
            </label>
            <button className="tf-primary" disabled={busy}>
              {busy ? "Iniciando…" : "Confirmar e iniciar atendimento"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function QuickDocumentUploadInStage() {
  const [target, setTarget] = useState<HTMLElement | null>(null),
    [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [cpf, setCpf] = useState(""),
    [birthDate, setBirthDate] = useState(""),
    [product, setProduct] = useState("Financiamento"),
    [file, setFile] = useState<File | null>(null),
    [reading, setReading] = useState(false),
    [readMessage, setReadMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const readDocument = async (selected:File|null) => {
    setFile(selected);setReadMessage("");
    if(!selected)return;
    setReading(true);
    const f=new FormData();f.append("file",selected);
    try{
      const r=await fetch("/api/documents/extract",{method:"POST",body:f}),x=await r.json();
      if(r.ok&&x.fields){
        setName(x.fields.name||"");setCpf(maskCpf(x.fields.cpf||""));setBirthDate(x.fields.birthDate||"");
        setReadMessage(x.fields.name&&x.fields.cpf&&x.fields.birthDate?"Dados identificados. Confira antes de continuar.":"Leitura parcial. Complete os campos que faltam.");
      }else setReadMessage(x.error||"Não foi possível ler o documento.");
    }catch{setReadMessage("Falha na leitura. Tente novamente.")}
    setReading(false);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const find = () =>
      setTarget(document.querySelector<HTMLElement>(".tf-kanban article.stage-0 footer"));
    find();
    const id = window.setTimeout(find, 80);
    return () => window.clearTimeout(id);
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await fetch("/api/deals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, cpf: cpfKey(cpf), birthDate: dateToIso(birthDate), product }),
    });
    const x = await r.json();
    if (r.ok && x.deal && file) {
      const f = new FormData();
      f.append("dealId", String(x.deal.id));
      f.append("documentType", "identidade");
      f.append("file", file);
      await fetch("/api/deal-documents", { method: "POST", body: f });
    }
    setBusy(false);
    if (r.ok) {
      setOpen(false);
      window.location.reload();
    } else alert(x.error || "Confira os dados extraídos.");
  };
  const button = (
    <button
      type="button"
      className="tf-upload-kanban"
      onClick={() => setOpen(true)}
      aria-label="Upload de documento"
      title="Upload de documento"
    >
      <FileUp />
    </button>
  );
  return (
    <>
      {target ? createPortal(button, target) : null}
      {open && (
        <div className="tf-modal-back">
          <form className="tf-modal" onSubmit={submit}>
            <button
              type="button"
              className="tf-modal-close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <small>INÍCIO RÁPIDO · DOCUMENTO</small>
            <h2>Upload de CNH ou identidade</h2>
            <p>
              Envie o documento e confirme os quatro dados usados para iniciar o
              atendimento.
            </p>
            <label>
              CNH ou identidade
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => readDocument(e.target.files?.[0] || null)}
                required
              />
            </label>
            {reading && <div className="tf-reading-document"><ScanText /> Lendo nome, CPF e nascimento…</div>}
            {!reading&&readMessage&&<div className="tf-reading-result">{readMessage}</div>}
            <label>
              Primeiro e segundo nome
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label>
              CPF
              <input
                value={cpf}
                onChange={(e) => setCpf(maskCpf(e.target.value))}
                inputMode="numeric"
                maxLength={14}
                required
                placeholder="000.000.000-00"
              />
            </label>
            <label>
              Data de nascimento
              <input
                inputMode="numeric"
                maxLength={10}
                value={birthDate}
                onChange={(e) => setBirthDate(maskDate(e.target.value))}
                placeholder="DD/MM/AAAA"
                required
              />
            </label>
            <label>
              Produto
              <select
                value={product}
                onChange={(e) => setProduct(e.target.value)}
              >
                {productOptions.map((option)=><option key={option}>{option}</option>)}
              </select>
            </label>
            <button className="tf-primary" disabled={busy||reading}>
              {busy ? "Salvando…" : "Confirmar e iniciar atendimento"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function DealDocuments({deal,close}:{deal:Deal;close:()=>void}){
  const [docs,setDocs]=useState<ClientDocument[]>([]),[busy,setBusy]=useState(false),[type,setType]=useState("identidade");
  const load=()=>fetch(`/api/deal-documents?dealId=${deal.id}`).then(r=>r.ok?r.json():null).then(x=>x?.documents&&setDocs(x.documents)).catch(()=>{});
  useEffect(()=>{load()},[deal.id]);
  const upload=async(e:React.ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);const f=new FormData();f.append("dealId",String(deal.id));f.append("documentType",type);f.append("file",file);const r=await fetch("/api/deal-documents",{method:"POST",body:f}),x=await r.json();if(r.ok&&x.document)setDocs(d=>[x.document,...d]);else alert(x.error||"Não foi possível anexar o documento.");setBusy(false);e.target.value=""};
  return <div className="tf-modal-back" onMouseDown={close}><section className="tf-modal tf-deal-doc-modal" onMouseDown={e=>e.stopPropagation()}>
    <button type="button" className="tf-modal-close" onClick={close}>×</button>
    <small>DOCUMENTOS DO ATENDIMENTO</small><h2>{deal.name}</h2><p>Os arquivos ficam no histórico deste atendimento e também na ficha do cliente.</p>
    <div className="tf-doc-upload-row"><select value={type} onChange={e=>setType(e.target.value)}><option value="identidade">RG / Identidade</option><option value="cnh">CNH</option><option value="cpf">CPF</option><option value="comprovante">Comprovante</option><option value="contrato">Contrato</option><option value="outro">Outro documento</option></select><label className="tf-upload-button"><FileUp /> {busy?"Enviando…":"Anexar arquivo"}<input type="file" accept="image/*,.pdf" onChange={upload} disabled={busy}/></label></div>
    {docs.length?<ul className="tf-deal-doc-list">{docs.map(d=><li key={d.id}><FileText/><span><a href={`/api/deal-documents?id=${d.id}`} target="_blank" rel="noreferrer"><b>{d.fileName}</b></a><small>{d.documentType} · {Math.ceil(d.sizeBytes/1024)} KB</small></span></li>)}</ul>:<p className="tf-doc-empty">Nenhum documento anexado neste atendimento.</p>}
  </section></div>
}
