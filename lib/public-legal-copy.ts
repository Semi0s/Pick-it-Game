import { normalizeLanguage, type SupportedLanguage } from "@/lib/i18n";

export type PublicLegalRouteKey = "privacy" | "terms" | "support";

export type PublicLegalCopy = {
  nav: {
    privacy: string;
    terms: string;
    support: string;
    languageNote: string;
  };
  privacy: {
    eyebrow: string;
    title: string;
    intro: string;
    effectiveTitle: string;
    effectiveDateLabel: string;
    versionLabel: string;
    dataTitle: string;
    dataItems: string[];
    useTitle: string;
    useItems: string[];
    visibleTitle: string;
    visibleItems: string[];
    privateDataText: string;
    notificationsTitle: string;
    notificationsText: string;
    deletionTitle: string;
    deletionText: string;
    deletionHelpPrefix: string;
    deletionHelpLink: string;
    deletionHelpSuffix: string;
    supportTitle: string;
    supportTextPrefix: string;
  };
  terms: {
    eyebrow: string;
    title: string;
    intro: string;
    effectiveTitle: string;
    effectiveDateLabel: string;
    versionLabel: string;
    reacceptanceText: string;
    noGamblingTitle: string;
    noGamblingText: string;
    scoringTitle: string;
    scoringText: string;
    acceptableUseTitle: string;
    acceptableUseItems: string[];
    moderationTitle: string;
    moderationText: string;
    responsibilityTitle: string;
    responsibilityText: string;
    availabilityTitle: string;
    availabilityText: string;
    supportTitle: string;
    supportTextPrefix: string;
  };
  support: {
    eyebrow: string;
    title: string;
    intro: string;
    contactTitle: string;
    contactPrefix: string;
    contactSuffix: string;
    reportProblem: string;
    reportProblemSubject: string;
    helpfulLinksTitle: string;
    privacyPolicy: string;
    terms: string;
    accountDeletionHelp: string;
    accountDeletionSubject: string;
    deletionTitle: string;
    deletionItems: string[];
    groupOwnershipTitle: string;
    groupOwnershipText: string;
  };
};

const ENGLISH_PUBLIC_LEGAL_COPY: PublicLegalCopy = {
  nav: {
    privacy: "Privacy",
    terms: "Terms",
    support: "Support",
    languageNote: "English is the controlling legal text. Translations are provided for convenience."
  },
  privacy: {
    eyebrow: "Privacy Policy",
    title: "How PICK-IT! handles your data",
    intro:
      "This policy explains the data PICK-IT! uses to run the World Cup prediction game, groups, leaderboards, support, and optional notifications.",
    effectiveTitle: "Effective date and version",
    effectiveDateLabel: "Effective date",
    versionLabel: "Version",
    dataTitle: "Data we collect",
    dataItems: [
      "Account email and authentication state needed to sign in and protect your account.",
      "Display name, profile details, home team, followed teams, visual preferences, and avatar/profile images if you add them.",
      "Predictions, picks, bracket choices, optional score picks, scoring results, leaderboard entries, trophies, and audit state needed to run the game.",
      "Group memberships, group roles, group names, group avatars, invite/access-code records, redemption records, and related display data needed for group access control.",
      "Reactions and comments only if those features are enabled. Free-form leaderboard comments are currently disabled by default.",
      "Notification preferences and native push/device token metadata, including platform, token, permission state, created/updated/last-seen timestamps, and signed-in user association.",
      "IP address, user agent, timestamps, and operational logs where needed for legal acceptance, security, abuse prevention, diagnostics, and app operations."
    ],
    useTitle: "How we use data",
    useItems: [
      "To provide account access, profile setup, group participation, invitations, and managed group tools.",
      "To save predictions, calculate scores, show standings, publish leaderboards, and correct scoring if official data or app logic requires review.",
      "To send reminders or updates only when you opt in to notifications, such as picks-lock reminders, match/scoring updates, leaderboard updates, or group activity.",
      "To provide support, investigate errors, prevent abuse, enforce terms, secure the app, and operate the service."
    ],
    visibleTitle: "What other users may see",
    visibleItems: [
      "Your display name, avatar, home team styling, group membership, score, rank, trophies, and leaderboard position where app views allow.",
      "Your predictions, picks, and public-picks views where the app or group settings make those visible.",
      "Comments and reactions only if those social features are enabled."
    ],
    privateDataText:
      "Email addresses, raw internal IDs, device tokens, private admin notes, and admin-only operational data are not public profile fields.",
    notificationsTitle: "Notifications",
    notificationsText:
      "Push notifications are optional. If you opt in, PICK-IT! stores your preferences and device-token metadata so notifications can be delivered. You can turn notification preferences off from the app when controls are available, and you can also disable notifications in your device settings.",
    deletionTitle: "Account deletion",
    deletionText:
      "Signed-in users can start account deletion from Profile. Deletion requires email confirmation and may be blocked while you own or manage active groups or organizations. If deletion is blocked, contact support for help transferring or removing that ownership first.",
    deletionHelpPrefix: "See ",
    deletionHelpLink: "account deletion help",
    deletionHelpSuffix: " for the public deletion instructions.",
    supportTitle: "Support",
    supportTextPrefix: "For privacy, account, safety, or support questions, contact "
  },
  terms: {
    eyebrow: "Terms / EULA",
    title: "PICK-IT! terms of use",
    intro:
      "These plain-language terms explain the rules for using PICK-IT!, participating in groups, making predictions, and using social features when they are enabled.",
    effectiveTitle: "Effective date and version",
    effectiveDateLabel: "Effective date",
    versionLabel: "Version",
    reacceptanceText:
      "The app may require signed-in users to accept the current active version before continuing. Super Admin tools can require re-acceptance when a new version is published.",
    noGamblingTitle: "Prediction game, not gambling",
    noGamblingText:
      "PICK-IT! is an entertainment prediction game for the World Cup. It is not gambling, betting, wagering, fantasy betting, or a paid pool. No cash prizes are offered unless a separate official rule or promotion explicitly says otherwise.",
    scoringTitle: "Scoring and corrections",
    scoringText:
      "Scores, standings, bracket results, and leaderboards may be corrected, recomputed, or republished if official match data, app logic, data imports, or technical errors require review. Super Admins and authorized admins may correct match results, scoring, leaderboards, and related technical issues.",
    acceptableUseTitle: "Acceptable use",
    acceptableUseItems: [
      "Do not harass, threaten, or abuse other users.",
      "Do not impersonate another person or misrepresent your identity.",
      "Do not use abusive, hateful, sexual, misleading, or objectionable display names, avatars, group names, comments, or reactions.",
      "Do not spam invitations, groups, leaderboards, comments, or support channels.",
      "Do not scrape, reverse engineer, tamper with, exploit, or interfere with the app, scoring, access codes, invitations, or leaderboards.",
      "Do not post objectionable comments or content if user-generated content features are enabled."
    ],
    moderationTitle: "User-generated content and moderation",
    moderationText:
      "Comments and other free-form social features may be disabled, limited, moderated, removed, or hidden. Admins may remove or neutralize inappropriate display names, avatars, group names, comments, reactions, or accounts to protect users and app integrity.",
    responsibilityTitle: "Account responsibility and eligibility",
    responsibilityText:
      "You are responsible for activity under your account and for keeping sign-in access secure. Use the app only if you are allowed to do so under the laws and rules that apply to you. If you manage a group, you are also responsible for using invite and access controls appropriately.",
    availabilityTitle: "Availability and limitations",
    availabilityText:
      "PICK-IT! is provided for entertainment and may change as the tournament, official data, or app features change. We work to keep the service accurate and available, but we cannot guarantee uninterrupted access or error-free data at all times.",
    supportTitle: "Support",
    supportTextPrefix: "Questions about these terms can be sent to "
  },
  support: {
    eyebrow: "Support",
    title: "Support, privacy, and account help",
    intro: "Use this page to contact support, report a problem, review legal pages, or understand account deletion.",
    contactTitle: "Contact support",
    contactPrefix: "Email ",
    contactSuffix: " for account, group, privacy, safety, or app support.",
    reportProblem: "Report a problem",
    reportProblemSubject: "PICK-IT! problem report",
    helpfulLinksTitle: "Helpful links",
    privacyPolicy: "Privacy Policy",
    terms: "Terms / EULA",
    accountDeletionHelp: "Account deletion help",
    accountDeletionSubject: "PICK-IT! account deletion help",
    deletionTitle: "Account deletion",
    deletionItems: [
      "Signed-in users can start deletion from Profile.",
      "Deletion requires typing the account email to confirm.",
      "Deletion may be blocked while the user owns or manages active groups or organizations.",
      "If deletion is blocked, contact support for help transferring ownership, removing managed access, or closing the managed group relationship first.",
      "Deletion removes account and profile data through the app flow. Some derived scoring, audit, or integrity records may be retained, removed, or anonymized according to app operations and legal requirements."
    ],
    groupOwnershipTitle: "Group ownership and managed groups",
    groupOwnershipText:
      "If you own or manage a group and need to delete your account, contact support before deletion. Support can help identify whether ownership or management needs to be transferred, removed, or closed."
  }
};

const PUBLIC_LEGAL_COPY: Record<SupportedLanguage, PublicLegalCopy> = {
  en: ENGLISH_PUBLIC_LEGAL_COPY,
  es: {
    nav: {
      privacy: "Privacidad",
      terms: "Términos",
      support: "Soporte",
      languageNote: "El texto legal en inglés es el texto controlador. Las traducciones se ofrecen por conveniencia."
    },
    privacy: {
      ...ENGLISH_PUBLIC_LEGAL_COPY.privacy,
      eyebrow: "Política de Privacidad",
      title: "Cómo PICK-IT! maneja tus datos",
      intro:
        "Esta política explica los datos que PICK-IT! usa para operar el juego de predicciones de la Copa Mundial, grupos, tablas, soporte y notificaciones opcionales.",
      effectiveTitle: "Fecha de vigencia y versión",
      effectiveDateLabel: "Fecha de vigencia",
      versionLabel: "Versión",
      dataTitle: "Datos que recopilamos",
      dataItems: [
        "Correo electrónico de la cuenta y estado de autenticación necesarios para iniciar sesión y proteger tu cuenta.",
        "Nombre visible, datos de perfil, equipo local, equipos seguidos, preferencias visuales e imágenes de avatar o perfil si las agregas.",
        "Predicciones, picks, llaves, picks opcionales de marcador, resultados de puntuación, tablas de posiciones, trofeos y estado de auditoría necesarios para operar el juego.",
        "Membresías de grupos, roles de grupo, nombres de grupos, avatares de grupo, registros de invitación/código de acceso, redenciones y datos relacionados necesarios para controlar el acceso.",
        "Reacciones y comentarios solo si esas funciones están habilitadas. Los comentarios libres en tablas están deshabilitados por defecto.",
        "Preferencias de notificación y metadatos de token/dispositivo push nativo, incluyendo plataforma, token, estado de permiso, fechas de creación/actualización/última actividad y asociación con usuario autenticado.",
        "Dirección IP, agente de usuario, fechas y registros operativos cuando sean necesarios para aceptación legal, seguridad, prevención de abuso, diagnósticos y operación de la app."
      ],
      useTitle: "Cómo usamos los datos",
      useItems: [
        "Para dar acceso a la cuenta, configuración de perfil, participación en grupos, invitaciones y herramientas de administración.",
        "Para guardar predicciones, calcular puntos, mostrar posiciones, publicar tablas y corregir puntuaciones si los datos oficiales o la lógica de la app requieren revisión.",
        "Para enviar recordatorios o actualizaciones solo si aceptas notificaciones, como recordatorios de cierre de picks, actualizaciones de partidos/puntuación, tablas o actividad de grupo.",
        "Para dar soporte, investigar errores, prevenir abuso, aplicar términos, proteger la app y operar el servicio."
      ],
      visibleTitle: "Qué pueden ver otros usuarios",
      visibleItems: [
        "Tu nombre visible, avatar, estilo de equipo local, membresía de grupo, puntos, posición, trofeos y lugar en tablas donde la app lo permita.",
        "Tus predicciones, picks y vistas públicas de picks donde la app o la configuración del grupo las hagan visibles.",
        "Comentarios y reacciones solo si esas funciones sociales están habilitadas."
      ],
      privateDataText:
        "Los correos electrónicos, IDs internos, tokens de dispositivo, notas privadas de administración y datos operativos solo de admin no son campos públicos del perfil.",
      notificationsTitle: "Notificaciones",
      notificationsText:
        "Las notificaciones push son opcionales. Si aceptas, PICK-IT! guarda tus preferencias y metadatos de token/dispositivo para enviar notificaciones. Puedes desactivar preferencias en la app cuando los controles estén disponibles y también desde la configuración del dispositivo.",
      deletionTitle: "Eliminación de cuenta",
      deletionText:
        "Los usuarios autenticados pueden iniciar la eliminación desde Perfil. La eliminación requiere confirmar el correo electrónico y puede bloquearse mientras seas dueño o administrador de grupos u organizaciones activas. Si se bloquea, contacta soporte para transferir o quitar esa propiedad primero.",
      deletionHelpPrefix: "Consulta la ",
      deletionHelpLink: "ayuda de eliminación de cuenta",
      deletionHelpSuffix: " para las instrucciones públicas.",
      supportTitle: "Soporte",
      supportTextPrefix: "Para preguntas de privacidad, cuenta, seguridad o soporte, contacta "
    },
    terms: {
      ...ENGLISH_PUBLIC_LEGAL_COPY.terms,
      eyebrow: "Términos / EULA",
      title: "Términos de uso de PICK-IT!",
      intro:
        "Estos términos en lenguaje simple explican las reglas para usar PICK-IT!, participar en grupos, hacer predicciones y usar funciones sociales cuando estén habilitadas.",
      effectiveTitle: "Fecha de vigencia y versión",
      effectiveDateLabel: "Fecha de vigencia",
      versionLabel: "Versión",
      reacceptanceText:
        "La app puede exigir que los usuarios autenticados acepten la versión activa actual antes de continuar. Las herramientas de Super Admin pueden exigir nueva aceptación cuando se publique una versión nueva.",
      noGamblingTitle: "Juego de predicción, no apuestas",
      noGamblingText:
        "PICK-IT! es un juego de predicción de entretenimiento para la Copa Mundial. No es juego de azar, apuesta, fantasy betting ni pool pago. No se ofrecen premios en efectivo salvo que una regla o promoción oficial separada lo indique expresamente.",
      scoringTitle: "Puntuación y correcciones",
      scoringText:
        "Las puntuaciones, posiciones, resultados de llaves y tablas pueden corregirse, recalcularse o republicarse si los datos oficiales, la lógica de la app, importaciones de datos o errores técnicos requieren revisión. Super Admins y admins autorizados pueden corregir resultados, puntuaciones, tablas y problemas técnicos relacionados.",
      acceptableUseTitle: "Uso aceptable",
      acceptableUseItems: [
        "No acoses, amenaces ni abuses de otros usuarios.",
        "No suplantes a otra persona ni tergiverses tu identidad.",
        "No uses nombres visibles, avatares, nombres de grupos, comentarios o reacciones abusivos, odiosos, sexuales, engañosos u objetables.",
        "No hagas spam en invitaciones, grupos, tablas, comentarios o canales de soporte.",
        "No extraigas datos, hagas ingeniería inversa, manipules, explotes o interfieras con la app, puntuación, códigos de acceso, invitaciones o tablas.",
        "No publiques comentarios o contenido objetable si las funciones de contenido generado por usuarios están habilitadas."
      ],
      moderationTitle: "Contenido de usuarios y moderación",
      moderationText:
        "Los comentarios y otras funciones sociales libres pueden deshabilitarse, limitarse, moderarse, eliminarse u ocultarse. Los admins pueden remover o neutralizar nombres visibles, avatares, nombres de grupos, comentarios, reacciones o cuentas inapropiadas para proteger a usuarios y la integridad de la app.",
      responsibilityTitle: "Responsabilidad de cuenta y elegibilidad",
      responsibilityText:
        "Eres responsable por la actividad de tu cuenta y por mantener seguro el acceso. Usa la app solo si tienes permitido hacerlo según las leyes y reglas aplicables. Si administras un grupo, también eres responsable de usar correctamente invitaciones y controles de acceso.",
      availabilityTitle: "Disponibilidad y limitaciones",
      availabilityText:
        "PICK-IT! se ofrece para entretenimiento y puede cambiar según el torneo, datos oficiales o funciones de la app. Trabajamos para mantener el servicio preciso y disponible, pero no garantizamos acceso ininterrumpido ni datos sin errores en todo momento.",
      supportTitle: "Soporte",
      supportTextPrefix: "Las preguntas sobre estos términos pueden enviarse a "
    },
    support: {
      ...ENGLISH_PUBLIC_LEGAL_COPY.support,
      eyebrow: "Soporte",
      title: "Soporte, privacidad y ayuda de cuenta",
      intro: "Usa esta página para contactar soporte, reportar un problema, revisar páginas legales o entender la eliminación de cuenta.",
      contactTitle: "Contactar soporte",
      contactPrefix: "Escribe a ",
      contactSuffix: " para soporte de cuenta, grupo, privacidad, seguridad o app.",
      reportProblem: "Reportar un problema",
      reportProblemSubject: "Reporte de problema de PICK-IT!",
      helpfulLinksTitle: "Enlaces útiles",
      privacyPolicy: "Política de Privacidad",
      terms: "Términos / EULA",
      accountDeletionHelp: "Ayuda de eliminación de cuenta",
      accountDeletionSubject: "Ayuda de eliminación de cuenta de PICK-IT!",
      deletionTitle: "Eliminación de cuenta",
      deletionItems: [
        "Los usuarios autenticados pueden iniciar la eliminación desde Perfil.",
        "La eliminación requiere escribir el correo electrónico de la cuenta para confirmar.",
        "La eliminación puede bloquearse mientras el usuario sea dueño o administrador de grupos u organizaciones activas.",
        "Si se bloquea, contacta soporte para transferir propiedad, quitar acceso administrativo o cerrar primero la relación de grupo administrado.",
        "La eliminación remueve datos de cuenta y perfil mediante el flujo de la app. Algunos registros derivados de puntuación, auditoría o integridad pueden conservarse, eliminarse o anonimizarse según operaciones de la app y requisitos legales."
      ],
      groupOwnershipTitle: "Propiedad de grupos y grupos administrados",
      groupOwnershipText:
        "Si eres dueño o administrador de un grupo y necesitas eliminar tu cuenta, contacta soporte antes de eliminarla. Soporte puede ayudar a identificar si la propiedad o administración debe transferirse, quitarse o cerrarse."
    }
  },
  fr: {
    ...ENGLISH_PUBLIC_LEGAL_COPY,
    nav: {
      privacy: "Confidentialité",
      terms: "Conditions",
      support: "Support",
      languageNote: "Le texte juridique anglais fait foi. Les traductions sont fournies par commodité."
    }
  },
  pt: {
    ...ENGLISH_PUBLIC_LEGAL_COPY,
    nav: {
      privacy: "Privacidade",
      terms: "Termos",
      support: "Suporte",
      languageNote: "O texto jurídico em inglês prevalece. As traduções são fornecidas por conveniência."
    }
  },
  de: {
    ...ENGLISH_PUBLIC_LEGAL_COPY,
    nav: {
      privacy: "Datenschutz",
      terms: "Bedingungen",
      support: "Support",
      languageNote: "Der englische Rechtstext ist maßgeblich. Übersetzungen werden nur zur Orientierung bereitgestellt."
    }
  }
};

export function getPublicLegalCopy(language?: string | null): {
  language: SupportedLanguage;
  copy: PublicLegalCopy;
} {
  const normalizedLanguage = normalizeLanguage(language);
  return {
    language: normalizedLanguage,
    copy: PUBLIC_LEGAL_COPY[normalizedLanguage] ?? PUBLIC_LEGAL_COPY.en
  };
}
