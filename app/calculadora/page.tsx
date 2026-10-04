import type { Metadata } from "next";
import FinancialCalculator from "../financial-calculator";

export const metadata: Metadata = {
  title: "Calculadora Financeira TF",
  description: "Simule antecipação de parcelas e descontos de juros.",
  manifest: "/calculadora.webmanifest",
};

export default function PublicCalculatorPage() {
  return <main className="tf-public-calculator tf-app dark theme-mono">
    <header className="tf-public-calculator-brand">
      <img src="/tf-logo-no-bg.png" alt="TF Assessoria e Finanças" />
      <span><b>Calculadora Financeira</b><small>Antecipação de parcelas</small></span>
    </header>
    <FinancialCalculator publicMode />
  </main>;
}
