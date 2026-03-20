/**
 * AIS "Type of ship" (from ITU-R M.1371 / AIS Message 5 static data).
 * Many relay snapshots only include a subset of fields; callers should treat this as optional.
 */

export function aisShipTypeCodeToLabel(code: number | null | undefined): string | null {
  if (!Number.isFinite(code as number)) return null;
  const c = Number(code);
  if (c <= 0 || c > 99) return null;

  // VT Explorer reference: https://api.vtexplorer.com/docs/ref-aistypes.html
  switch (c) {
    // Wing in ground craft
    case 20:
    case 21:
    case 22:
    case 23:
    case 24:
    case 25:
    case 26:
    case 27:
    case 28:
    case 29:
      return "Wing-in-ground (WIG)";

    // Towing / underwater ops
    case 31:
    case 32:
      return "Towing vessel";
    case 33:
      return "Dredging / underwater ops";
    case 34:
      return "Diving operations";

    // Military ops
    case 35:
      return "Military operations (AIS)";

    // Sailing / pleasure
    case 36:
      return "Sailing vessel";
    case 37:
      return "Pleasure craft";

    // High speed craft
    case 40:
    case 41:
    case 42:
    case 43:
    case 44:
    case 45:
    case 46:
    case 47:
    case 48:
    case 49:
      return "High speed craft (HSC)";

    // Service vessels
    case 50:
      return "Pilot vessel";
    case 51:
      return "Search & rescue (SAR)";
    case 52:
      return "Tug";
    case 53:
      return "Port tender";
    case 54:
      return "Anti-pollution equipment";
    case 55:
      return "Law enforcement";
    case 56:
    case 57:
      return "Local/spare vessel";
    case 58:
      return "Medical transport";
    case 59:
      return "Noncombatant ship";

    // Passenger
    case 60:
    case 61:
    case 62:
    case 63:
    case 64:
    case 65:
    case 66:
    case 67:
    case 68:
    case 69:
      return "Passenger vessel";

    // Cargo
    case 70:
    case 71:
    case 72:
    case 73:
    case 74:
    case 75:
    case 76:
    case 77:
    case 78:
    case 79:
      return "Cargo ship";

    // Tanker
    case 80:
    case 81:
    case 82:
    case 83:
    case 84:
    case 85:
    case 86:
    case 87:
    case 88:
    case 89:
      return "Tanker";

    // Other
    case 90:
    case 91:
    case 92:
    case 93:
    case 94:
    case 95:
    case 96:
    case 97:
    case 98:
    case 99:
      return "Other type";

    default:
      return null;
  }
}

