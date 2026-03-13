import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function AlertTrendsChart({ trends }) {
  if (!trends || trends.length === 0) return (
    <div className="flex items-center justify-center h-32 text-slate-300 text-sm">No data yet</div>
  );

  const maxVal = Math.max(...trends.map((t) => t.total || 0), 1);

  const data = {
    labels: trends.map((t) => {
      const d = new Date(t.date + "T00:00:00Z");
      return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
    }),
    datasets: [
      {
        label: "Total",
        data: trends.map((t) => t.total || 0),
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.08)",
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#3b82f6",
        borderWidth: 2,
      },
      {
        label: "Critical",
        data: trends.map((t) => t.critical || 0),
        borderColor: "#ef4444",
        backgroundColor: "transparent",
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#ef4444",
        borderWidth: 1.5,
        borderDash: [4, 3],
      },
      {
        label: "High",
        data: trends.map((t) => t.high || 0),
        borderColor: "#f97316",
        backgroundColor: "transparent",
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#f97316",
        borderWidth: 1.5,
        borderDash: [4, 3],
      },
    ],
  };

  const options = {
    responsive: true,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "top",
        labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, padding: 16 },
      },
      tooltip: {
        backgroundColor: "#1e293b",
        titleColor: "#94a3b8",
        bodyColor: "#f1f5f9",
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: "#94a3b8" },
      },
      y: {
        beginAtZero: true,
        max: maxVal + 1,
        ticks: {
          stepSize: 1,
          precision: 0,
          font: { size: 11 },
          color: "#94a3b8",
          callback: (v) => Number.isInteger(v) ? v : null,
        },
        grid: { color: "#f1f5f9" },
      },
    },
  };

  return <Line data={data} options={options} />;
}
