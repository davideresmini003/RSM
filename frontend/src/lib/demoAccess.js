import { api } from "./api";

// Demo credentials matching backend startup seed.
// Used only for one-click demo access — NOT for production auth.
export const DEMO_ACCOUNTS = [
  { role: "cedente",       email: "cedente@demo.eu",       password: "Demo123!",  label: "Cedente",       company: "AseguradoraIbérica Demo" },
  { role: "reasegurador",  email: "reasegurador@demo.eu",  password: "Demo123!",  label: "Reasegurador",  company: "Helvetia Re Demo" },
  { role: "broker",        email: "broker@demo.eu",        password: "Demo123!",  label: "Broker",        company: "Aon Iberia Broker Demo" },
  { role: "admin",         email: "admin@rsm.eu",          password: "Admin123!", label: "Admin",         company: "RSM Technologies" },
];

export async function quickLogin(role) {
  const acc = DEMO_ACCOUNTS.find((a) => a.role === role);
  if (!acc) throw new Error("Unknown role");
  const { data } = await api.post("/auth/login", { email: acc.email, password: acc.password });
  localStorage.setItem("rsm_token", data.token);
  return data.user;
}
