import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function AlertTrendsChart({ trends }) {
  if (!trends || trends.length === 0) return null;

  const data = {
    labels: trends.map(t => {
      const d = new Date(t.date);
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    }),
    datasets: [
      {
        label: "Total",
        data: trends.map(t => t.total),
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        fill: true,
        tension: 0.3,
      },
      {
        label: "Critical",
        data: trends.map(t => t.critical || 0),
        borderColor: "rgb(239, 68, 68)",
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        fill: false,
        tension: 0.3,
      },
      {
        label: "High",
        data: trends.map(t => t.high || 0),
        borderColor: "rgb(249, 115, 22)",
        backgroundColor: "rgba(249, 115, 22, 0.1)",
        fill: false,
        tension: 0.3,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: "top" },
    },
    scales: {
      y: { beginAtZero: true, ticks: { stepSize: 1 } },
    },
  };

  return <Line data={data} options={options} />;
}
