interface ProgressBarProps {
  current: number;
  goal: number;
  currency?: string;
}

export default function ProgressBar({ current, goal, currency = "ARS" }: ProgressBarProps) {
  const percentage = Math.min((current / goal) * 100, 100);
  const formatMoney = (n: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(n);

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-semibold text-brand-700">{formatMoney(current)}</span>
        <span className="text-gray-500">Meta: {formatMoney(goal)}</span>
      </div>
      <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-brand-600 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 text-right">{percentage.toFixed(1)}% completado</p>
    </div>
  );
}
