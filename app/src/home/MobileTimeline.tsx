import ArcTimeline from './timeline/ArcTimeline';

interface Props {
  years: string[];
  selectedYear: string | null;
  onSelect: (year: string | null) => void;
}

export default function MobileTimeline({ years, selectedYear, onSelect }: Props) {
  return <ArcTimeline years={years} selectedYear={selectedYear} onSelect={onSelect} />;
}
