/** Mensajes honestos para la franja de confianza sobre la lista de vacantes. */
export function getJobsTrustBarCopy(isPersonalized: boolean): {
  primary: string;
  secondary: string | null;
} {
  if (isPersonalized) {
    return {
      primary:
        "Te mostramos vacantes donde tienes mayor probabilidad de recibir respuesta",
      secondary: null,
    };
  }
  return {
    primary:
      "Priorizamos vacantes con señales que suelen ir ligadas a más respuestas",
    secondary:
      "Sin sesión usamos solo datos del anuncio; al entrar, afinamos la lista con tu perfil real.",
  };
}
