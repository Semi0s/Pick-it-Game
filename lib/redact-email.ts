export function redactEmailAddress(email: string) {
  const trimmedEmail = email.trim();
  const atIndex = trimmedEmail.indexOf("@");
  if (atIndex <= 0) {
    return trimmedEmail;
  }

  const localPart = trimmedEmail.slice(0, atIndex);
  const domain = trimmedEmail.slice(atIndex + 1);
  const [domainName, ...domainRest] = domain.split(".");
  const maskedLocal =
    localPart.length <= 2 ? `${localPart[0] ?? ""}*` : `${localPart.slice(0, 2)}${"*".repeat(Math.max(2, localPart.length - 2))}`;
  const maskedDomainName =
    domainName.length <= 2 ? `${domainName[0] ?? ""}*` : `${domainName.slice(0, 2)}${"*".repeat(Math.max(2, domainName.length - 2))}`;

  return `${maskedLocal}@${[maskedDomainName, ...domainRest].filter(Boolean).join(".")}`;
}
