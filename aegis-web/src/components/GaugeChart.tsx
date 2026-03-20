"use client";

type GaugeChartProps = {
  value: number;
  label: string;
};

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export default function GaugeChart({ value, label }: GaugeChartProps) {
  const safe = clamp(value);
  const rotationDeg = -120 + (safe / 100) * 240;

  return (
    <div style={{ width: "100%", maxWidth: 360 }}>
      <svg
        viewBox="0 0 820 377.01"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`${label} ${safe} out of 100`}
      >
        <defs>
          <linearGradient id="gaugeGradient" x1="110.1897" y1="191.1173" x2="706.6127" y2="191.1173">
            <stop offset="0.0163" stopColor="#FF414E" />
            <stop offset="0.1164" stopColor="#FF454B" />
            <stop offset="0.22" stopColor="#FF5241" />
            <stop offset="0.3252" stopColor="#FF6631" />
            <stop offset="0.4308" stopColor="#FF831A" />
            <stop offset="0.5267" stopColor="#FFA400" />
            <stop offset="0.5711" stopColor="#EEA700" />
            <stop offset="0.7099" stopColor="#BFB000" />
            <stop offset="0.8327" stopColor="#9DB700" />
            <stop offset="0.9336" stopColor="#88BB00" />
            <stop offset="1" stopColor="#80BC00" />
          </linearGradient>
        </defs>

        <path
          fillRule="evenodd"
          clipRule="evenodd"
          fill="url(#gaugeGradient)"
          d="M568.804,88.873l-43.406,66.84c-32.832-21.059-71.687-33.537-113.405-34.306V42.145 C469.679,42.826,523.43,59.866,568.804,88.873z M210.055,247.809c16.726-36.116,43.04-66.884,75.688-89.022l-43.115-66.391 c-45.334,30.374-81.863,72.853-104.985,122.81L210.055,247.809z M291.512,155.016c32.938-20.848,71.848-33.1,113.588-33.626V42.141 c-57.629,0.626-111.336,17.582-156.703,46.483L291.512,155.016z M574.566,92.654l-43.434,66.882 c35.619,24.467,63.608,59.237,79.647,100.021l75.182-28.5C663.631,174.375,624.439,126.183,574.566,92.654z M207.249,254.104 l-72.426-32.609c-15.807,36.345-24.603,76.444-24.633,118.599h79.79c-0.001-0.271-0.01-0.54-0.01-0.811 C189.969,309.057,196.126,280.271,207.249,254.104z M613.188,266.016c8.174,22.899,12.638,47.56,12.638,73.267 c0,0.271-0.009,0.54-0.01,0.811h80.797c-0.026-36.053-6.451-70.609-18.199-102.594L613.188,266.016z"
        />

        <g transform={`rotate(${rotationDeg} 408.401 339.2)`}>
          <path
            fill="#333333"
            d="M399.821,351.126c-0.707,0-1.41-0.298-1.904-0.879c-0.896-1.051-0.77-2.629,0.282-3.524l197.96-168.643 c1.05-0.896,2.627-0.771,3.524,0.282c0.896,1.051,0.769,2.629-0.282,3.524l-197.96,168.643 C400.971,350.93,400.394,351.126,399.821,351.126z"
          />
          <polygon fill="#333333" points="591.264,175.709 605.974,173.003 600.965,187.096" />
        </g>

        <circle fill="#FFFFFF" cx="408.401" cy="339.2" r="18.337" />
        <path
          fill="#333333"
          d="M408.401,359.834c-11.378,0-20.634-9.256-20.634-20.634s9.256-20.634,20.634-20.634 s20.635,9.256,20.635,20.634S419.779,359.834,408.401,359.834z M408.401,323.161c-8.844,0-16.04,7.195-16.04,16.04 s7.195,16.04,16.04,16.04c8.844,0,16.039-7.195,16.039-16.04S417.245,323.161,408.401,323.161z"
        />
      </svg>
      <div style={{ marginTop: -10, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span>{label}</span>
        <strong>{safe}/100</strong>
      </div>
    </div>
  );
}
