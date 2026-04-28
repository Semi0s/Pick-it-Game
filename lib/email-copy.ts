import { escapeHtml } from "@/lib/email-sender";
import { defaultLanguage, normalizeLanguage, type SupportedLanguage } from "@/lib/i18n";

export function buildGroupInviteEmailCopy(input: {
  language?: string | null;
  groupName: string;
  invitedEmail: string;
  suggestedDisplayName?: string | null;
  inviterLabel?: string | null;
  claimUrl: string;
}) {
  const language = normalizeLanguage(input.language);
  const copy = language === "es" ? GROUP_INVITE_COPY.es : GROUP_INVITE_COPY.en;
  const inviterLabel = input.inviterLabel?.trim() || copy.defaultInviterLabel;
  const introLine = input.suggestedDisplayName?.trim()
    ? copy.introWithSuggestedName(inviterLabel, input.suggestedDisplayName.trim(), input.invitedEmail, input.groupName)
    : copy.intro(inviterLabel, input.invitedEmail, input.groupName);

  const escapedGroupName = escapeHtml(input.groupName);
  const escapedInviterLabel = escapeHtml(inviterLabel);
  const escapedIntroLine = escapeHtml(introLine);
  const escapedClaimUrl = escapeHtml(input.claimUrl);

  return {
    subject: copy.subject(inviterLabel, input.groupName),
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <h1 style="font-size: 24px; margin-bottom: 16px;">${escapeHtml(copy.heading(inviterLabel, input.groupName))}</h1>
        <div style="margin-bottom: 16px; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px 14px; background: #f9fafb;">
          <p style="margin: 0 0 6px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; font-weight: 700;">${escapeHtml(copy.detailsLabel)}</p>
          <p style="margin: 0; font-weight: 700;">${escapeHtml(copy.groupLabel)}: ${escapedGroupName}</p>
          <p style="margin: 4px 0 0 0; font-weight: 700;">${escapeHtml(copy.invitedByLabel)}: ${escapedInviterLabel}</p>
        </div>
        <p style="margin-bottom: 12px;">${escapedIntroLine}</p>
        <p style="margin-bottom: 12px;">${escapeHtml(copy.actionIntro)}</p>
        <p style="margin-bottom: 12px;">${escapeHtml(copy.aboutPickIt)}</p>
        <p style="margin-bottom: 12px; font-weight: 600;">${escapeHtml(copy.freeToPlay)}</p>
        <p style="margin: 24px 0;">
          <a href="${escapedClaimUrl}" style="display: inline-block; background: #1f8b4c; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 6px; font-weight: 700;">
            ${escapeHtml(copy.actionLabel)}
          </a>
        </p>
        <p style="font-size: 14px; color: #6b7280; word-break: break-all;">${escapedClaimUrl}</p>
        <p style="font-size: 14px; color: #6b7280;">${escapeHtml(copy.accountHelp(input.invitedEmail))}</p>
      </div>
    `,
    text: [
      copy.subject(inviterLabel, input.groupName),
      "",
      `${copy.groupLabel}: ${input.groupName}`,
      `${copy.invitedByLabel}: ${inviterLabel}`,
      "",
      introLine,
      "",
      copy.actionIntro,
      copy.aboutPickIt,
      copy.freeToPlay,
      "",
      input.claimUrl,
      "",
      copy.accountHelp(input.invitedEmail)
    ].join("\n")
  };
}

export function buildAdminRecoveryEmailCopy(input: {
  language?: string | null;
  isConfirmed: boolean;
  recipientLabel: string;
  email: string;
  actionUrl: string;
}) {
  const language = normalizeLanguage(input.language);
  const copy = language === "es" ? ADMIN_RECOVERY_COPY.es : ADMIN_RECOVERY_COPY.en;
  const subject = input.isConfirmed ? copy.setupSubject : copy.confirmSubject;
  const heading = input.isConfirmed ? copy.setupHeading : copy.confirmHeading;
  const intro = input.isConfirmed
    ? copy.setupIntro(input.recipientLabel)
    : copy.confirmIntro(input.email);
  const actionLabel = input.isConfirmed ? copy.setupAction : copy.confirmAction;
  const note = input.isConfirmed ? copy.setupNote : copy.confirmNote;
  const escapedActionUrl = escapeHtml(input.actionUrl);

  return {
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <h1 style="font-size: 24px; margin-bottom: 16px;">${escapeHtml(heading)}</h1>
        <p style="margin-bottom: 16px;">${escapeHtml(intro)}</p>
        <p style="margin: 24px 0;">
          <a href="${escapedActionUrl}" style="display: inline-block; background: #1f8b4c; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 6px; font-weight: 700;">
            ${escapeHtml(actionLabel)}
          </a>
        </p>
        <p style="margin-bottom: 12px; font-size: 14px; color: #4b5563;">
          ${escapeHtml(copy.fallbackLabel)}<br />
          <span style="word-break: break-all;">${escapedActionUrl}</span>
        </p>
        <p style="font-size: 14px; color: #6b7280;">${escapeHtml(note)}</p>
      </div>
    `,
    text: [subject, "", intro, "", `${actionLabel}:`, input.actionUrl, "", note].join("\n")
  };
}

type GroupInviteCopy = {
  subject: (inviterLabel: string, groupName: string) => string;
  heading: (inviterLabel: string, groupName: string) => string;
  defaultInviterLabel: string;
  detailsLabel: string;
  groupLabel: string;
  invitedByLabel: string;
  intro: (inviterLabel: string, invitedEmail: string, groupName: string) => string;
  introWithSuggestedName: (inviterLabel: string, suggestedName: string, invitedEmail: string, groupName: string) => string;
  actionIntro: string;
  aboutPickIt: string;
  freeToPlay: string;
  actionLabel: string;
  accountHelp: (invitedEmail: string) => string;
};

const GROUP_INVITE_COPY: Record<SupportedLanguage, GroupInviteCopy> = {
  en: {
    subject: (inviterLabel, groupName) => `${inviterLabel} invited you to join ${groupName}`,
    heading: (inviterLabel, groupName) => `${inviterLabel} invited you to join ${groupName}`,
    defaultInviterLabel: "A group manager",
    detailsLabel: "Invitation details",
    groupLabel: "Group",
    invitedByLabel: "Invited by",
    intro: (inviterLabel, invitedEmail, groupName) => `${inviterLabel} invited ${invitedEmail} to join ${groupName}.`,
    introWithSuggestedName: (inviterLabel, suggestedName, invitedEmail, groupName) =>
      `${inviterLabel} invited ${suggestedName} (${invitedEmail}) to join ${groupName}.`,
    actionIntro: "Use this secure link to sign in or create your account, then join the group.",
    aboutPickIt: "PICK-IT! is a free-to-play World Cup prediction game where friends and groups make picks, compare scores, and climb the leaderboard together.",
    freeToPlay: "Free to play. No download required.",
    actionLabel: "Join PICK-IT!",
    accountHelp: (invitedEmail) =>
      `If you already have an account, sign in with ${invitedEmail}. Otherwise create one with that email first.`
  },
  es: {
    subject: (inviterLabel, groupName) => `${inviterLabel} te invitó a unirte a ${groupName}`,
    heading: (inviterLabel, groupName) => `${inviterLabel} te invitó a unirte a ${groupName}`,
    defaultInviterLabel: "Un administrador del grupo",
    detailsLabel: "Detalles de la invitación",
    groupLabel: "Grupo",
    invitedByLabel: "Invitado por",
    intro: (inviterLabel, invitedEmail, groupName) => `${inviterLabel} invitó a ${invitedEmail} a unirse a ${groupName}.`,
    introWithSuggestedName: (inviterLabel, suggestedName, invitedEmail, groupName) =>
      `${inviterLabel} invitó a ${suggestedName} (${invitedEmail}) a unirse a ${groupName}.`,
    actionIntro: "Usa este enlace seguro para iniciar sesión o crear tu cuenta y luego unirte al grupo.",
    aboutPickIt: "PICK-IT! es un juego gratuito de predicciones del Mundial donde amigos y grupos hacen picks, comparan puntajes y suben en la clasificación juntos.",
    freeToPlay: "Gratis para jugar. No requiere descarga.",
    actionLabel: "Únete a PICK-IT!",
    accountHelp: (invitedEmail) =>
      `Si ya tienes una cuenta, inicia sesión con ${invitedEmail}. Si no, crea una cuenta primero con ese correo.`
  }
};

const ADMIN_RECOVERY_COPY = {
  en: {
    confirmSubject: "Confirm your Pick-It account",
    confirmHeading: "Confirm your account",
    confirmIntro: (email: string) => `Use the secure confirmation link below to finish creating your Pick-It account for ${email}.`,
    confirmAction: "Confirm Account",
    confirmNote: "This link confirms the account first, then returns them to the app.",
    setupSubject: "Finish your Pick-It profile setup",
    setupHeading: "Finish setting up your profile",
    setupIntro: (recipientLabel: string) =>
      `${recipientLabel}, finish your profile setup so your groups, scores, and leaderboard name stay in sync.`,
    setupAction: "Open Profile Setup",
    setupNote: "This link signs the player in and sends them straight to profile setup.",
    fallbackLabel: "If the button does not work, paste this link into your browser:"
  },
  es: {
    confirmSubject: "Confirma tu cuenta de Pick-It",
    confirmHeading: "Confirma tu cuenta",
    confirmIntro: (email: string) =>
      `Usa el enlace seguro de confirmación a continuación para terminar de crear tu cuenta de Pick-It para ${email}.`,
    confirmAction: "Confirmar Cuenta",
    confirmNote: "Este enlace confirma la cuenta primero y luego devuelve al usuario a la aplicación.",
    setupSubject: "Termina de configurar tu perfil de Pick-It",
    setupHeading: "Termina de configurar tu perfil",
    setupIntro: (recipientLabel: string) =>
      `${recipientLabel}, termina de configurar tu perfil para que tus grupos, puntajes y nombre en la clasificación se mantengan sincronizados.`,
    setupAction: "Abrir Configuración de Perfil",
    setupNote: "Este enlace inicia sesión al jugador y lo lleva directamente a la configuración de perfil.",
    fallbackLabel: "Si el botón no funciona, pega este enlace en tu navegador:"
  }
} as const;

export function getSafeEmailLanguage(input?: string | null) {
  return normalizeLanguage(input ?? defaultLanguage);
}
