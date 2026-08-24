import CrystalTimeline from './timeline/CrystalTimeline';

interface Props {
  years: string[];
  selectedYear: string | null;
  onSelect: (year: string | null) => void;
}

export default function MobileTimeline({ years, selectedYear, onSelect }: Props) {
  return <CrystalTimeline years={years} selectedYear={selectedYear} onSelect={onSelect} />;
}
