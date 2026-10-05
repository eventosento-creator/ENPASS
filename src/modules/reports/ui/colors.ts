// Colores de datos: azul = ventas, violeta = RRPP, naranja = taquilla, rosa = mesas, verde = ocupación/crecimiento.
export const reportColors = {
  sales: "#5b8cff", direct: "#5b8cff", rrpp: "#a78bfa", box_office: "#fb923c", tables: "#f472b6",
  courtesy: "#9ca3af", growth: "#34d399", online: "#5b8cff",
} as const;

export const originLabels = { direct: "Directas", rrpp: "RRPP", box_office: "Taquilla", tables: "Mesas" } as const;
