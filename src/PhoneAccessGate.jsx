import { isCurrentDevicePhone } from "./features/device/deviceSupport.js";
import "./styles/phone-access-gate.css";

function PhoneAccessBlocked() {
  return (
    <main className="phone-access-gate" role="main" aria-labelledby="phone-access-title">
      <section className="phone-access-card">
        <div className="phone-access-brand">
          <img src="/sketchizi-logo.svg" alt="" width="44" height="44" />
          <span>Sketchizi</span>
        </div>
        <div className="phone-access-device-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none">
            <rect x="13" y="4.5" width="22" height="39" rx="4" />
            <path d="M20 10h8M22 37h4" />
            <path d="M7 7l34 34" />
          </svg>
        </div>
        <p className="phone-access-eyebrow">DEVICE NOT SUPPORTED</p>
        <h1 id="phone-access-title">Sketchizi isn’t available on phones</h1>
        <p className="phone-access-description">
          To use the full diagramming workspace, open Sketchizi on a tablet or desktop computer.
        </p>
        <div className="phone-access-supported">
          <span aria-hidden="true">✓</span>
          <span>Tablets and desktop computers are supported.</span>
        </div>
      </section>
    </main>
  );
}

export default function PhoneAccessGate({ children }) {
  if (isCurrentDevicePhone()) return <PhoneAccessBlocked />;
  return children;
}
