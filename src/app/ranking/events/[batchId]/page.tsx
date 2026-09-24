import ImpactClient from "@/components/ranking/ImpactClient";

export const metadata = {
  title: "Impacto del evento · Cosa Nostra",
  description: "Análisis de impacto de una importación BetaDomino sobre el ranking GFCN",
};

export default async function EventImpactPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  return <ImpactClient batchId={batchId} />;
}
