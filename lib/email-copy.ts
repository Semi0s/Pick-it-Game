import { escapeHtml } from "@/lib/email-sender";
import { defaultLanguage, normalizeLanguage, type SupportedLanguage } from "@/lib/i18n";
import { getAccessLevelDisplayLabel, type AccessLevel } from "@/lib/tier-access";

export function buildGroupInviteEmailCopy(input: {
  language?: string | null;
  groupName: string;
  invitedEmail: string;
  suggestedDisplayName?: string | null;
  customMessage?: string | null;
  inviterLabel?: string | null;
  existingAccount?: boolean | null;
  claimUrl: string;
}) {
  const language = getEmailCopyLanguage(input.language);
  const copy = GROUP_INVITE_COPY[language] ?? GROUP_INVITE_COPY.en;
  const inviterLabel = input.inviterLabel?.trim() || copy.defaultInviterLabel;
  const introLine = input.suggestedDisplayName?.trim()
    ? copy.introWithSuggestedName(inviterLabel, input.suggestedDisplayName.trim(), input.invitedEmail, input.groupName)
    : copy.intro(inviterLabel, input.invitedEmail, input.groupName);

  const escapedGroupName = escapeHtml(input.groupName);
  const escapedInviterLabel = escapeHtml(inviterLabel);
  const escapedIntroLine = escapeHtml(introLine);
  const escapedCustomMessage = input.customMessage?.trim() ? escapeHtml(input.customMessage.trim()) : null;
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
        ${
          escapedCustomMessage
            ? `<div style="margin-bottom: 16px; border-left: 4px solid #d1d5db; border-radius: 6px; padding: 12px 14px; background: #ffffff;">
                <p style="margin: 0 0 6px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; font-weight: 700;">${escapeHtml(copy.customMessageLabel)}</p>
                <p style="margin: 0; white-space: pre-wrap;">${escapedCustomMessage}</p>
              </div>`
            : ""
        }
        <p style="margin-bottom: 12px;">${escapeHtml(copy.actionIntro(Boolean(input.existingAccount), input.invitedEmail))}</p>
        <p style="margin-bottom: 12px;">${escapeHtml(copy.aboutPickIt)}</p>
        <p style="margin-bottom: 12px; font-weight: 600;">${escapeHtml(copy.freeToPlay)}</p>
        <p style="margin: 24px 0;">
          <a href="${escapedClaimUrl}" style="display: inline-block; background: #1f8b4c; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 6px; font-weight: 700;">
            ${escapeHtml(copy.actionLabel)}
          </a>
        </p>
        <p style="font-size: 14px; color: #6b7280; word-break: break-all;">${escapedClaimUrl}</p>
        <p style="font-size: 14px; color: #6b7280;">${escapeHtml(copy.accountHelp(Boolean(input.existingAccount), input.invitedEmail))}</p>
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
      ...(input.customMessage?.trim()
        ? [copy.customMessageLabel, input.customMessage.trim(), ""]
        : []),
      copy.actionIntro(Boolean(input.existingAccount), input.invitedEmail),
      copy.aboutPickIt,
      copy.freeToPlay,
      "",
      input.claimUrl,
      "",
      copy.accountHelp(Boolean(input.existingAccount), input.invitedEmail)
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
  const language = getEmailCopyLanguage(input.language);
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

export function buildAdminAccessLevelChangeEmailCopy(input: {
  language?: string | null;
  recipientLabel: string;
  accessLevel: AccessLevel;
  loginUrl: string;
}) {
  const language = getEmailCopyLanguage(input.language);
  const copy = language === "es" ? ADMIN_ACCESS_LEVEL_CHANGE_COPY.es : ADMIN_ACCESS_LEVEL_CHANGE_COPY.en;
  const accessLevelLabel = getAccessLevelDisplayLabel(input.accessLevel);
  const intro = copy.intro(input.recipientLabel, accessLevelLabel);
  const escapedLoginUrl = escapeHtml(input.loginUrl);

  return {
    subject: copy.subject(accessLevelLabel),
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <h1 style="font-size: 24px; margin-bottom: 16px;">${escapeHtml(copy.heading(accessLevelLabel))}</h1>
        <p style="margin-bottom: 16px;">${escapeHtml(intro)}</p>
        <div style="margin-bottom: 16px; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px 14px; background: #f9fafb;">
          <p style="margin: 0 0 6px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; font-weight: 700;">${escapeHtml(copy.levelLabel)}</p>
          <p style="margin: 0; font-weight: 700;">${escapeHtml(accessLevelLabel)}</p>
        </div>
        <p style="margin: 24px 0;">
          <a href="${escapedLoginUrl}" style="display: inline-block; background: #1f8b4c; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 6px; font-weight: 700;">
            ${escapeHtml(copy.actionLabel)}
          </a>
        </p>
        <p style="margin-bottom: 12px; font-size: 14px; color: #4b5563;">
          ${escapeHtml(copy.fallbackLabel)}<br />
          <span style="word-break: break-all;">${escapedLoginUrl}</span>
        </p>
        <p style="font-size: 14px; color: #6b7280;">${escapeHtml(copy.note)}</p>
      </div>
    `,
    text: [
      copy.subject(accessLevelLabel),
      "",
      intro,
      "",
      `${copy.levelLabel}: ${accessLevelLabel}`,
      "",
      `${copy.actionLabel}:`,
      input.loginUrl,
      "",
      copy.note
    ].join("\n")
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
  actionIntro: (existingAccount: boolean, invitedEmail: string) => string;
  customMessageLabel: string;
  aboutPickIt: string;
  freeToPlay: string;
  actionLabel: string;
  accountHelp: (existingAccount: boolean, invitedEmail: string) => string;
};

type EmailCopyLanguage = SupportedLanguage;

function getEmailCopyLanguage(language?: string | null): EmailCopyLanguage {
  return normalizeLanguage(language);
}

const GROUP_INVITE_COPY: Record<EmailCopyLanguage, GroupInviteCopy> = {
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
    actionIntro: (existingAccount, invitedEmail) =>
      existingAccount
        ? `You've been invited to join this group. Sign in with ${invitedEmail} to continue.`
        : `You've been invited to join this group. Create your account with ${invitedEmail} to continue.`,
    customMessageLabel: "Message from your group manager",
    aboutPickIt: "PICK-IT! is a free-to-play World Cup prediction game where friends and groups make picks, compare scores, and climb the leaderboard together.",
    freeToPlay: "Free to play. No download required.",
    actionLabel: "Join PICK-IT!",
    accountHelp: (existingAccount, invitedEmail) =>
      existingAccount
        ? `If you already have an account, sign in with ${invitedEmail} and use this invite link to join.`
        : `Create your account with ${invitedEmail}, confirm your email, then sign in to finish joining.`
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
    actionIntro: (existingAccount, invitedEmail) =>
      existingAccount
        ? `Te invitaron a unirte a este grupo. Inicia sesión con ${invitedEmail} para continuar.`
        : `Te invitaron a unirte a este grupo. Crea tu cuenta con ${invitedEmail} para continuar.`,
    customMessageLabel: "Mensaje de tu administrador del grupo",
    aboutPickIt: "PICK-IT! es un juego gratuito de predicciones del Mundial donde amigos y grupos hacen picks, comparan puntajes y suben en la clasificación juntos.",
    freeToPlay: "Gratis para jugar. No requiere descarga.",
    actionLabel: "Únete a PICK-IT!",
    accountHelp: (existingAccount, invitedEmail) =>
      existingAccount
        ? `Si ya tienes una cuenta, inicia sesión con ${invitedEmail} y usa este enlace de invitación para unirte.`
        : `Crea tu cuenta con ${invitedEmail}, confirma tu correo y luego inicia sesión para terminar de unirte.`
  },
  fr: {
    subject: (inviterLabel, groupName) => `${inviterLabel} vous invite à rejoindre ${groupName}`,
    heading: (inviterLabel, groupName) => `${inviterLabel} vous invite à rejoindre ${groupName}`,
    defaultInviterLabel: "Un responsable de groupe",
    detailsLabel: "Détails de l'invitation",
    groupLabel: "Groupe",
    invitedByLabel: "Invité par",
    intro: (inviterLabel, invitedEmail, groupName) => `${inviterLabel} a invité ${invitedEmail} à rejoindre ${groupName}.`,
    introWithSuggestedName: (inviterLabel, suggestedName, invitedEmail, groupName) =>
      `${inviterLabel} a invité ${suggestedName} (${invitedEmail}) à rejoindre ${groupName}.`,
    actionIntro: (existingAccount, invitedEmail) =>
      existingAccount
        ? `Vous êtes invité à rejoindre ce groupe. Connectez-vous avec ${invitedEmail} pour continuer.`
        : `Vous êtes invité à rejoindre ce groupe. Créez votre compte avec ${invitedEmail} pour continuer.`,
    customMessageLabel: "Message de votre responsable de groupe",
    aboutPickIt: "PICK-IT! est un jeu gratuit de pronostics pour la Coupe du monde où amis et groupes font leurs choix, comparent leurs scores et grimpent au classement ensemble.",
    freeToPlay: "Gratuit. Aucun téléchargement requis.",
    actionLabel: "Rejoindre PICK-IT!",
    accountHelp: (existingAccount, invitedEmail) =>
      existingAccount
        ? `Si vous avez déjà un compte, connectez-vous avec ${invitedEmail} et utilisez ce lien d'invitation pour rejoindre le groupe.`
        : `Créez votre compte avec ${invitedEmail}, confirmez votre e-mail, puis connectez-vous pour finaliser votre arrivée.`
  },
  pt: {
    subject: (inviterLabel, groupName) => `${inviterLabel} convidou-o para entrar em ${groupName}`,
    heading: (inviterLabel, groupName) => `${inviterLabel} convidou-o para entrar em ${groupName}`,
    defaultInviterLabel: "Um gestor do grupo",
    detailsLabel: "Detalhes do convite",
    groupLabel: "Grupo",
    invitedByLabel: "Convidado por",
    intro: (inviterLabel, invitedEmail, groupName) => `${inviterLabel} convidou ${invitedEmail} para entrar em ${groupName}.`,
    introWithSuggestedName: (inviterLabel, suggestedName, invitedEmail, groupName) =>
      `${inviterLabel} convidou ${suggestedName} (${invitedEmail}) para entrar em ${groupName}.`,
    actionIntro: (existingAccount, invitedEmail) =>
      existingAccount
        ? `Foi convidado para entrar neste grupo. Entre com ${invitedEmail} para continuar.`
        : `Foi convidado para entrar neste grupo. Crie a sua conta com ${invitedEmail} para continuar.`,
    customMessageLabel: "Mensagem do gestor do grupo",
    aboutPickIt: "PICK-IT! é um jogo gratuito de previsões da Copa do Mundo onde amigos e grupos fazem picks, comparam pontuações e sobem juntos na classificação.",
    freeToPlay: "Grátis para jogar. Não requer download.",
    actionLabel: "Entrar no PICK-IT!",
    accountHelp: (existingAccount, invitedEmail) =>
      existingAccount
        ? `Se já tem uma conta, entre com ${invitedEmail} e use este link de convite para entrar.`
        : `Crie a sua conta com ${invitedEmail}, confirme o email e depois entre para concluir a entrada.`
  },
  de: {
    subject: (inviterLabel, groupName) => `${inviterLabel} hat dich eingeladen, ${groupName} beizutreten`,
    heading: (inviterLabel, groupName) => `${inviterLabel} hat dich eingeladen, ${groupName} beizutreten`,
    defaultInviterLabel: "Ein Gruppenmanager",
    detailsLabel: "Einladungsdetails",
    groupLabel: "Gruppe",
    invitedByLabel: "Eingeladen von",
    intro: (inviterLabel, invitedEmail, groupName) => `${inviterLabel} hat ${invitedEmail} eingeladen, ${groupName} beizutreten.`,
    introWithSuggestedName: (inviterLabel, suggestedName, invitedEmail, groupName) =>
      `${inviterLabel} hat ${suggestedName} (${invitedEmail}) eingeladen, ${groupName} beizutreten.`,
    actionIntro: (existingAccount, invitedEmail) =>
      existingAccount
        ? `Du wurdest eingeladen, dieser Gruppe beizutreten. Melde dich mit ${invitedEmail} an, um fortzufahren.`
        : `Du wurdest eingeladen, dieser Gruppe beizutreten. Erstelle dein Konto mit ${invitedEmail}, um fortzufahren.`,
    customMessageLabel: "Nachricht deines Gruppenmanagers",
    aboutPickIt: "PICK-IT! ist ein kostenloses WM-Tippspiel, bei dem Freunde und Gruppen Tipps abgeben, Punkte vergleichen und gemeinsam in der Rangliste aufsteigen.",
    freeToPlay: "Kostenlos spielbar. Kein Download erforderlich.",
    actionLabel: "PICK-IT! beitreten",
    accountHelp: (existingAccount, invitedEmail) =>
      existingAccount
        ? `Wenn du bereits ein Konto hast, melde dich mit ${invitedEmail} an und nutze diesen Einladungslink.`
        : `Erstelle dein Konto mit ${invitedEmail}, bestätige deine E-Mail und melde dich dann an, um den Beitritt abzuschließen.`
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

const ADMIN_ACCESS_LEVEL_CHANGE_COPY = {
  en: {
    subject: (accessLevelLabel: string) => `Your PICK-IT! access level is now ${accessLevelLabel}`,
    heading: (accessLevelLabel: string) => `Your access level is now ${accessLevelLabel}`,
    intro: (recipientLabel: string, accessLevelLabel: string) =>
      `${recipientLabel}, your PICK-IT! access level has been updated to ${accessLevelLabel}.`,
    levelLabel: "Access level",
    actionLabel: "Open PICK-IT!",
    fallbackLabel: "If the button does not work, paste this link into your browser:",
    note: "Use this link to sign in with your existing account."
  },
  es: {
    subject: (accessLevelLabel: string) => `Tu nivel de acceso de PICK-IT! ahora es ${accessLevelLabel}`,
    heading: (accessLevelLabel: string) => `Tu nivel de acceso ahora es ${accessLevelLabel}`,
    intro: (recipientLabel: string, accessLevelLabel: string) =>
      `${recipientLabel}, tu nivel de acceso de PICK-IT! se actualizó a ${accessLevelLabel}.`,
    levelLabel: "Nivel de acceso",
    actionLabel: "Abrir PICK-IT!",
    fallbackLabel: "Si el botón no funciona, pega este enlace en tu navegador:",
    note: "Usa este enlace para iniciar sesión con tu cuenta actual."
  }
} as const;

export function getSafeEmailLanguage(input?: string | null) {
  return normalizeLanguage(input ?? defaultLanguage);
}
