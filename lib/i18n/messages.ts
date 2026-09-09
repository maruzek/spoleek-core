import type { SortLocaleTag } from "@/lib/collation";

/**
 * Public-surface dictionary.
 *
 * Scope note: this covers the signed-out pages only (login, join, activation,
 * legal chrome) plus the transactional emails that lead into them. The admin
 * and portal side is deliberately still English — see docs/PRD.md for the
 * staged i18n plan.
 *
 * Every entry is either a string or a function of its interpolation params.
 * Functions rather than "{name}" placeholders because Czech needs grammar, not
 * substitution: number agreement and case endings change the words themselves,
 * so the language owns the sentence-building.
 */

const en = {
  locale: "en",
  /** BCP-47 tag for `Intl`; carries a region so day/month order is defined. */
  formatLocale: "en-GB",
  appName: "Spoleek",

  common: {
    skipToContent: "Skip to content",
    back: "Back",
    backToSignIn: "Back to sign in",
    terms: "Terms",
    privacy: "Privacy",
    workspaceFallback: "Workspace",
  },

  auth: {
    title: "Sign in",
    subtitle: "Use your organization account to reach the member portal.",
    continueWithGoogle: "Continue with Google",
    or: "or",
    emailLabel: "Email",
    passwordLabel: "Password",
    errorTitle: "Authentication failed",
    errorBody:
      "Check your email and password, or contact your administrator for a fresh invite.",
    submit: "Sign in",
    googleOnlyNotice: "This workspace signs members in through Google.",
    applyPrompt:
      "Accounts are created after an administrator approves a join request.",
    applyLink: "Apply to join",
  },

  join: {
    eyebrow: "Public application",
    aside:
      "Submit the form once. If the organization needs anything else, they can follow up with you directly.",
    formTitle: "Apply to join",
    formDescription:
      "Fill in your contact details, answer the organization's questions, and submit your application for review.",
    firstName: "First name",
    lastName: "Last name",
    email: "Email",
    emailHint: "Use the address where you want the organization to contact you.",
    readTerms: "Read terms",
    readPrivacy: "Read privacy policy",
    /** Consent wording follows the document kind; see docs/legal-policies.md §2.2. */
    /**
     * The title is rendered as a link to the document, so these take a
     * placeholder and the form splits the sentence around it. Interpolating
     * keeps the grammar natural in both locales, which prefix/suffix pairs
     * cannot do.
     */
    acceptDocument: (title: string) => `I accept the ${title}.`,
    confirmReadDocument: (title: string) => `I confirm I have read the ${title}.`,
    serverErrorTitle: "We couldn't submit the application",
    submit: "Submit application",
    submitting: "Submitting…",
    successTitle: "Application received",
    successBody: (organizationName: string) =>
      `Thank you for applying to ${organizationName}. Your details are recorded and there is nothing else to send.`,
    successSteps: [
      "An administrator reviews your application.",
      "If they approve it, you get an email at the address you gave us.",
      "That email carries a secure activation link that sets up your login.",
    ],
  },

  activation: {
    eyebrow: "Account activation",
    title: "Finish setting up your member account.",
    body: (organizationName: string) =>
      `Your membership at ${organizationName} has been approved. Create your password and complete the remaining profile details to enter the member portal.`,
    signInEmailLabel: "Sign-in email:",
    passwordLabel: "Create password",
    confirmPasswordLabel: "Confirm password",
    profileFieldsLabel: "Required profile fields",
    profileFieldsHint:
      "Finish the organization-specific questions below before entering the portal.",
    serverErrorTitle: "We couldn't finish the activation",
    submit: "Finish account setup",
    submitting: "Finishing setup…",
    invalidTitle: "This activation link is invalid.",
    invalidBody:
      "Ask an organization administrator to send you a fresh invitation email, then open only the newest link they send.",
    expiredTitle: "This activation link has expired.",
    expiredBody:
      "Ask an organization administrator to resend your invitation email and use the latest link only.",
    completedTitle: "This account has already been activated.",
    completedBody:
      "Your membership is already linked. Return to sign in with your approved email address and password.",
    blockedTitle: "Too many activation attempts were detected.",
    blockedBody: (until: string | null) =>
      until
        ? `Wait until ${until} and then try again with the newest invite link, or ask an administrator to resend it.`
        : "Wait a few minutes and then try again with the newest invite link, or ask an administrator to resend it.",
  },

  legal: {
    backToApplication: "Back to application",
    termsTitle: "Terms of service",
    privacyTitle: "Privacy policy",
  },

  /** Labels rendered by the shared custom-field and group widgets. */
  fields: {
    selectOption: "Select an option",
    selectGroup: "Select a group…",
    noGroups: "No groups available",
    characterCount: (used: number, max: number) =>
      `${used} / ${max} characters`,
    selectExactly: (count: number) => `Select exactly ${count}.`,
    selectBetween: (min: number, max: number) =>
      `Select between ${min} and ${max}.`,
    selectAtLeast: (min: number) => `Select at least ${min}.`,
    selectAtMost: (max: number) => `Select up to ${max}.`,
  },

  /**
   * Server-authoritative answer validation. Every message is prefixed by the
   * organization's own field label, which is already in the org's language.
   */
  validation: {
    required: (label: string) => `${label} is required.`,
    mustBeNumber: (label: string) => `${label} must be a valid number.`,
    mustBeEmail: (label: string) => `${label} must be a valid email address.`,
    mustBeDate: (label: string) => `${label} must be a valid date.`,
    wholeNumber: (label: string) => `${label} must be a whole number.`,
    numberMin: (label: string, min: number) =>
      `${label} must be at least ${min}.`,
    numberMax: (label: string, max: number) => `${label} must be at most ${max}.`,
    optionsMin: (label: string, min: number) =>
      `${label} needs at least ${min} ${min === 1 ? "option" : "options"} selected.`,
    optionsMax: (label: string, max: number) =>
      `${label} allows at most ${max} ${max === 1 ? "option" : "options"}.`,
    ageMin: (label: string, min: number) =>
      `${label} requires an age of at least ${min}.`,
    ageMax: (label: string, max: number) =>
      `${label} requires an age of at most ${max}.`,
    dateMin: (label: string, day: string) =>
      `${label} must not be earlier than ${day}.`,
    dateMax: (label: string, day: string) =>
      `${label} must not be later than ${day}.`,
    lengthMin: (label: string, min: number) =>
      `${label} must be at least ${min} ${min === 1 ? "character" : "characters"}.`,
    lengthMax: (label: string, max: number) =>
      `${label} must be at most ${max} ${max === 1 ? "character" : "characters"}.`,
    patternMessage: (label: string, message: string) => `${label}: ${message}`,
    patternGeneric: (label: string) =>
      `${label} is not in the expected format.`,
  },

  /** Group-category selection on the join form. */
  groupRegistration: {
    noneAvailable: "No groups are currently available in this category.",
    chooseGroup: "Choose a group for this category.",
    chooseValidGroup: "Choose a valid group from this category.",
    categoryUnavailable: "This registration category is no longer available.",
  },

  /** Zod messages and thrown server errors on the public write paths. */
  errors: {
    firstNameRequired: "First name is required.",
    lastNameRequired: "Last name is required.",
    invalidEmail: "Enter a valid email address.",
    acceptTerms: "You must accept the organization terms.",
    acceptPrivacy: "You must accept the privacy policy.",
    acceptDocument: "You must respond to every document above.",
    tokenRequired: "Invitation token is required.",
    passwordTooShort: "Password must be at least 12 characters long.",
    confirmPasswordRequired: "Confirm your password.",
    passwordsDoNotMatch: "Passwords do not match.",
    notSetUp: "The application is not set up yet.",
    tooManySubmissions:
      "Too many applications from this connection. Please try again in an hour.",
    policyIncomplete: "Organization policy setup is incomplete.",
    unableToResolveApplicant: "Unable to resolve the applicant record.",
    inviteUnavailable: "This invitation is no longer available.",
    inviteInvalid:
      "This invitation is invalid or expired. Ask an administrator for a new one.",
    tooManyAttempts:
      "Too many activation attempts were detected. Wait a few minutes and try the newest invite link again.",
    passwordNotSet: "Unable to set the password for this invitation.",
    autoSignInFailed: "Your password was saved, but automatic sign-in failed.",
  },

  emails: {
    activation: {
      heading: "Your membership has been approved",
      greeting: (memberName: string) => `Hello ${memberName},`,
      cta: "Create password and finish setup",
      expiry:
        "This link expires in 1 hour. If it stops working, ask an administrator to send a fresh invitation.",
      fallbackIntro: "If the button does not open, paste this URL into your browser:",
    },

    received: {
      subject: (organizationName: string) =>
        `We received your application to ${organizationName}`,
      heading: "We have your application",
      greeting: (applicantName: string) => `Hello ${applicantName},`,
      body: (organizationName: string, submittedAt: string) =>
        `Thank you for applying to join ${organizationName} on ${submittedAt}. An administrator will review your application. Once it is approved you will get a second email with a link to set your password and finish your profile — there is nothing more for you to do until then.`,
      selectionsTitle: "What you selected",
      agreedTitle: "What you agreed to",
      agreedBody: (submittedAt: string) =>
        `On ${submittedAt} you responded to the documents below. Each link opens the exact version you were shown, kept unchanged on record.`,
      documentLine: (title: string, version: string) => `${title} — version ${version}`,
      versionNote:
        "Keep this email as your record. These links stay pointed at the versions you responded to, even after the documents are updated.",
      notYou: (organizationName: string) =>
        `If you did not apply to ${organizationName}, you can ignore this email. Nothing further happens without an administrator approving the application.`,
    },
    policyPublished: {
      subject: (organizationName: string, documentTitle: string) =>
        `${organizationName}: ${documentTitle} has been updated`,
      heading: (documentTitle: string) => `${documentTitle} has been updated`,
      greeting: (memberName: string) => `Hello ${memberName},`,
      body: (organizationName: string, documentTitle: string, effectiveFrom: string) =>
        `${organizationName} published a new version of the ${documentTitle}, in force from ${effectiveFrom}.`,
      changesTitle: "What changed",
      actionRequired:
        "You will be asked to confirm this the next time you open the member portal. Nothing else is needed from you now.",
      noActionRequired:
        "This is a minor change, so you do not need to do anything — your earlier response still stands.",
      readVersion: "Read this version",
      keepThis:
        "This link points at the exact version described above and keeps working after the document is updated again.",
    },

    rejected: {
      subject: (organizationName: string) =>
        `Your application to ${organizationName}`,
      heading: "About your application",
      greeting: (applicantName: string) => `Hello ${applicantName},`,
      body: (organizationName: string, decidedAt: string) =>
        `Thank you for your interest in ${organizationName}. Your membership application was reviewed on ${decidedAt} and we are not able to accept it at this time.`,
      reasonTitle: "From the reviewer",
      deleted:
        "Your application and everything you submitted with it have been deleted. All we keep is a record of this message. You are welcome to apply again later if your circumstances change.",
      contact: (contactEmail: string) =>
        `If you have questions about this decision, write to ${contactEmail}.`,
    },

    membershipDeleted: {
      subject: (organizationName: string) =>
        `Your membership in ${organizationName} has ended`,
      heading: "Your membership has ended",
      greeting: (memberName: string) => `Hello ${memberName},`,
      body: (organizationName: string, deletedAt: string) =>
        `Your membership in ${organizationName} was ended on ${deletedAt}. You have been signed out and no longer have access to the member portal.`,
      recordTitle: "What happens to your record",
      record: (purgeAfter: string) =>
        `Your membership record is kept until ${purgeAfter} in case this was a mistake, and is permanently deleted after that date. Ask an administrator before then if it should be restored.`,
      workspaceTitle: "Your organization email account",
      workspace: (workspaceEmail: string, purgeAfter: string) =>
        `Your ${workspaceEmail} account still works and will keep working until ${purgeAfter}. Use that time to save anything you want to keep — mail, files and photos are all included.`,
      workspaceHowTo:
        "Google Takeout (takeout.google.com) exports everything from that account in one archive. Sign in with the address above rather than a personal account.",
      workspaceEnds: (purgeAfter: string) =>
        `After ${purgeAfter} the account and everything left in it are deleted and cannot be recovered.`,
      contact: (contactEmail: string) =>
        `If you think this was a mistake, write to ${contactEmail} before that date.`,
    },

    existingAccount: {
      subject: (organizationName: string) =>
        `You are already a member of ${organizationName}`,
      heading: "You already have a membership",
      greeting: (memberName: string) => `Hello ${memberName},`,
      body: (organizationName: string, submittedAt: string) =>
        `A join form was submitted with this email address on ${submittedAt}, but it is already registered with ${organizationName}. No new application was created and nothing about your membership has changed.`,
      cta: "Sign in instead",
      helpNote:
        "If this was you and you cannot get in, use Forgot password on the sign-in page. If it was not you, someone typed your address into a public form — there is nothing to fix, but tell an administrator if it keeps happening.",
    },
  },
};

/**
 * The English tree is the contract. Typing `cs` as Dictionary makes a missing
 * or misspelled key a compile error rather than an English string leaking into
 * a Czech page at runtime.
 */
export type Dictionary = typeof en;

/**
 * Czech has three number forms, not two: 1 takes the singular, 2–4 the
 * nominative plural, 5+ the genitive plural (1 znak / 3 znaky / 7 znaků).
 * A generic `plural(count, word)` helper cannot express that, so each countable
 * noun declares its own three forms and the language picks between them.
 */
function csPlural(count: number, one: string, few: string, many: string) {
  if (count === 1) return one;
  if (count >= 2 && count <= 4) return few;
  return many;
}

const csOptions = (count: number) =>
  csPlural(count, "možnost", "možnosti", "možností");
const csCharacters = (count: number) =>
  csPlural(count, "znak", "znaky", "znaků");
const csYears = (count: number) => csPlural(count, "rok", "roky", "let");

/**
 * Field labels are authored by the organization, so their gender and case are
 * unknown to us. Czech messages therefore quote the label as an apposition
 * ("Pole „Datum narození“ …") instead of inflecting it, which keeps every
 * sentence grammatical whatever the admin typed.
 */
const csField = (label: string) => `Pole „${label}“`;

const cs: Dictionary = {
  locale: "cs",
  formatLocale: "cs-CZ",
  appName: "Spoleek",

  common: {
    skipToContent: "Přejít na obsah",
    back: "Zpět",
    backToSignIn: "Zpět na přihlášení",
    terms: "Podmínky",
    privacy: "Soukromí",
    workspaceFallback: "Organizace",
  },

  auth: {
    title: "Přihlášení",
    subtitle: "Přihlaste se účtem své organizace do členského portálu.",
    continueWithGoogle: "Pokračovat přes Google",
    or: "nebo",
    emailLabel: "E-mail",
    passwordLabel: "Heslo",
    errorTitle: "Přihlášení se nezdařilo",
    errorBody:
      "Zkontrolujte e-mail a heslo, nebo požádejte správce o novou pozvánku.",
    submit: "Přihlásit se",
    googleOnlyNotice: "Tato organizace přihlašuje členy přes Google.",
    applyPrompt: "Účet vám vznikne poté, co správce schválí vaši přihlášku.",
    applyLink: "Podat přihlášku",
  },

  join: {
    eyebrow: "Veřejná přihláška",
    aside:
      "Formulář stačí odeslat jednou. Pokud bude organizace potřebovat něco dalšího, ozve se vám přímo.",
    formTitle: "Podat přihlášku",
    formDescription:
      "Vyplňte kontaktní údaje, odpovězte na otázky organizace a odešlete přihlášku ke schválení.",
    firstName: "Jméno",
    lastName: "Příjmení",
    email: "E-mail",
    emailHint: "Uveďte adresu, na které vás má organizace kontaktovat.",
    readTerms: "Přečíst podmínky",
    readPrivacy: "Přečíst zásady ochrany osobních údajů",
    acceptDocument: (title: string) => `Souhlasím s dokumentem ${title}.`,
    confirmReadDocument: (title: string) =>
      `Potvrzuji, že jsem si přečetl(a) dokument ${title}.`,
    serverErrorTitle: "Přihlášku se nepodařilo odeslat",
    submit: "Odeslat přihlášku",
    submitting: "Odesílání…",
    successTitle: "Přihláška byla přijata",
    successBody: (organizationName: string) =>
      `Děkujeme za přihlášku do organizace ${organizationName}. Vaše údaje jsme zaznamenali a nic dalšího posílat nemusíte.`,
    successSteps: [
      "Správce vaši přihlášku posoudí.",
      "Pokud ji schválí, přijde vám e-mail na adresu, kterou jste uvedli.",
      "V e-mailu bude bezpečný aktivační odkaz, kterým si nastavíte přihlášení.",
    ],
  },

  activation: {
    eyebrow: "Aktivace účtu",
    title: "Dokončete nastavení svého členského účtu.",
    body: (organizationName: string) =>
      `Vaše členství v organizaci ${organizationName} bylo schváleno. Vytvořte si heslo a doplňte zbývající údaje profilu, abyste mohli vstoupit do členského portálu.`,
    signInEmailLabel: "Přihlašovací e-mail:",
    passwordLabel: "Vytvořit heslo",
    confirmPasswordLabel: "Potvrdit heslo",
    profileFieldsLabel: "Povinné údaje profilu",
    profileFieldsHint:
      "Před vstupem do portálu vyplňte následující otázky organizace.",
    serverErrorTitle: "Aktivaci se nepodařilo dokončit",
    submit: "Dokončit nastavení účtu",
    submitting: "Dokončování…",
    invalidTitle: "Tento aktivační odkaz je neplatný.",
    invalidBody:
      "Požádejte správce organizace o nový e-mail s pozvánkou a otevřete pouze nejnovější odkaz.",
    expiredTitle: "Platnost tohoto aktivačního odkazu vypršela.",
    expiredBody:
      "Požádejte správce organizace o opětovné zaslání pozvánky a použijte pouze nejnovější odkaz.",
    completedTitle: "Tento účet už byl aktivován.",
    completedBody:
      "Vaše členství je již propojeno. Přihlaste se schválenou e-mailovou adresou a heslem.",
    blockedTitle: "Zaznamenali jsme příliš mnoho pokusů o aktivaci.",
    blockedBody: (until: string | null) =>
      until
        ? `Počkejte do ${until} a poté to zkuste znovu s nejnovějším odkazem z pozvánky, nebo požádejte správce o jeho opětovné zaslání.`
        : "Počkejte několik minut a poté to zkuste znovu s nejnovějším odkazem z pozvánky, nebo požádejte správce o jeho opětovné zaslání.",
  },

  legal: {
    backToApplication: "Zpět na přihlášku",
    termsTitle: "Podmínky služby",
    privacyTitle: "Zásady ochrany osobních údajů",
  },

  fields: {
    selectOption: "Vyberte možnost",
    selectGroup: "Vyberte skupinu…",
    noGroups: "Žádné skupiny nejsou k dispozici",
    characterCount: (used: number, max: number) =>
      `${used} / ${max} ${csCharacters(max)}`,
    selectExactly: (count: number) =>
      `Vyberte přesně ${count} ${csOptions(count)}.`,
    selectBetween: (min: number, max: number) =>
      `Vyberte ${min} až ${max} ${csOptions(max)}.`,
    selectAtLeast: (min: number) =>
      `Vyberte alespoň ${min} ${csOptions(min)}.`,
    selectAtMost: (max: number) => `Vyberte nejvýše ${max} ${csOptions(max)}.`,
  },

  validation: {
    required: (label: string) => `Vyplňte pole „${label}“.`,
    mustBeNumber: (label: string) =>
      `${csField(label)} musí obsahovat platné číslo.`,
    mustBeEmail: (label: string) =>
      `${csField(label)} musí obsahovat platnou e-mailovou adresu.`,
    mustBeDate: (label: string) =>
      `${csField(label)} musí obsahovat platné datum.`,
    wholeNumber: (label: string) =>
      `${csField(label)} musí obsahovat celé číslo.`,
    numberMin: (label: string, min: number) =>
      `${csField(label)} musí být alespoň ${min}.`,
    numberMax: (label: string, max: number) =>
      `${csField(label)} musí být nejvýše ${max}.`,
    optionsMin: (label: string, min: number) =>
      `V poli „${label}“ vyberte alespoň ${min} ${csOptions(min)}.`,
    optionsMax: (label: string, max: number) =>
      `V poli „${label}“ vyberte nejvýše ${max} ${csOptions(max)}.`,
    ageMin: (label: string, min: number) =>
      `${csField(label)} vyžaduje věk alespoň ${min} ${csYears(min)}.`,
    ageMax: (label: string, max: number) =>
      `${csField(label)} vyžaduje věk nejvýše ${max} ${csYears(max)}.`,
    dateMin: (label: string, day: string) =>
      `Datum v poli „${label}“ nesmí být dřívější než ${day}.`,
    dateMax: (label: string, day: string) =>
      `Datum v poli „${label}“ nesmí být pozdější než ${day}.`,
    lengthMin: (label: string, min: number) =>
      `${csField(label)} musí mít alespoň ${min} ${csCharacters(min)}.`,
    lengthMax: (label: string, max: number) =>
      `${csField(label)} musí mít nejvýše ${max} ${csCharacters(max)}.`,
    patternMessage: (label: string, message: string) =>
      `${csField(label)}: ${message}`,
    patternGeneric: (label: string) =>
      `${csField(label)} nemá očekávaný formát.`,
  },

  groupRegistration: {
    noneAvailable: "V této kategorii nejsou aktuálně k dispozici žádné skupiny.",
    chooseGroup: "Vyberte skupinu pro tuto kategorii.",
    chooseValidGroup: "Vyberte platnou skupinu z této kategorie.",
    categoryUnavailable: "Tato registrační kategorie již není k dispozici.",
  },

  errors: {
    firstNameRequired: "Vyplňte jméno.",
    lastNameRequired: "Vyplňte příjmení.",
    invalidEmail: "Zadejte platnou e-mailovou adresu.",
    acceptTerms: "Musíte souhlasit s podmínkami organizace.",
    acceptPrivacy: "Musíte souhlasit se zásadami ochrany osobních údajů.",
    acceptDocument: "Musíte se vyjádřit ke každému dokumentu výše.",
    tokenRequired: "Chybí token pozvánky.",
    passwordTooShort: "Heslo musí mít alespoň 12 znaků.",
    confirmPasswordRequired: "Potvrďte heslo.",
    passwordsDoNotMatch: "Hesla se neshodují.",
    notSetUp: "Aplikace zatím není nastavena.",
    tooManySubmissions:
      "Z tohoto připojení přišlo příliš mnoho přihlášek. Zkuste to prosím za hodinu.",
    policyIncomplete: "Nastavení pravidel organizace není dokončeno.",
    unableToResolveApplicant: "Záznam žadatele se nepodařilo načíst.",
    inviteUnavailable: "Tato pozvánka již není k dispozici.",
    inviteInvalid:
      "Tato pozvánka je neplatná nebo jí vypršela platnost. Požádejte správce o novou.",
    tooManyAttempts:
      "Zaznamenali jsme příliš mnoho pokusů o aktivaci. Počkejte několik minut a zkuste to znovu s nejnovějším odkazem z pozvánky.",
    passwordNotSet: "K této pozvánce se nepodařilo nastavit heslo.",
    autoSignInFailed: "Heslo bylo uloženo, ale automatické přihlášení se nezdařilo.",
  },

  emails: {
    activation: {
      heading: "Vaše členství bylo schváleno",
      greeting: (memberName: string) => `Dobrý den, ${memberName},`,
      cta: "Vytvořit heslo a dokončit nastavení",
      expiry:
        "Platnost odkazu je 1 hodina. Pokud přestane fungovat, požádejte správce o novou pozvánku.",
      fallbackIntro: "Pokud tlačítko nefunguje, vložte tuto adresu do prohlížeče:",
    },

    received: {
      subject: (organizationName: string) =>
        `Přijali jsme vaši přihlášku do organizace ${organizationName}`,
      heading: "Máme vaši přihlášku",
      greeting: (applicantName: string) => `Dobrý den, ${applicantName},`,
      body: (organizationName: string, submittedAt: string) =>
        `Děkujeme za přihlášku do organizace ${organizationName} podanou ${submittedAt}. Vaši přihlášku posoudí správce. Jakmile ji schválí, přijde vám druhý e-mail s odkazem pro nastavení hesla a doplnění profilu — do té doby nemusíte nic dělat.`,
      selectionsTitle: "Co jste vybrali",
      agreedTitle: "S čím jste souhlasili",
      agreedBody: (submittedAt: string) =>
        `Dne ${submittedAt} jste se vyjádřili k níže uvedeným dokumentům. Každý odkaz otevře přesně tu verzi, která vám byla zobrazena; zůstává uložena beze změny.`,
      documentLine: (title: string, version: string) => `${title} — verze ${version}`,
      versionNote:
        "Uschovejte si tento e-mail jako doklad. Odkazy vedou na verze, ke kterým jste se vyjádřili, i po pozdější aktualizaci dokumentů.",
      notYou: (organizationName: string) =>
        `Pokud jste se do organizace ${organizationName} nepřihlašovali, můžete tento e-mail ignorovat. Bez schválení správcem se nic dalšího neděje.`,
    },
    policyPublished: {
      subject: (organizationName: string, documentTitle: string) =>
        `${organizationName}: dokument ${documentTitle} byl aktualizován`,
      heading: (documentTitle: string) => `Dokument ${documentTitle} byl aktualizován`,
      greeting: (memberName: string) => `Dobrý den, ${memberName},`,
      body: (organizationName: string, documentTitle: string, effectiveFrom: string) =>
        `Organizace ${organizationName} zveřejnila novou verzi dokumentu ${documentTitle} s účinností od ${effectiveFrom}.`,
      changesTitle: "Co se změnilo",
      actionRequired:
        "Při příštím otevření členského portálu budete požádáni o potvrzení. Nyní od vás nic dalšího nepotřebujeme.",
      noActionRequired:
        "Jde o drobnou změnu, takže nemusíte nic dělat — vaše dřívější vyjádření nadále platí.",
      readVersion: "Zobrazit tuto verzi",
      keepThis:
        "Odkaz vede přesně na výše popsanou verzi a funguje i po další aktualizaci dokumentu.",
    },

    rejected: {
      subject: (organizationName: string) =>
        `Vaše přihláška do organizace ${organizationName}`,
      heading: "K vaší přihlášce",
      greeting: (applicantName: string) => `Dobrý den, ${applicantName},`,
      body: (organizationName: string, decidedAt: string) =>
        `Děkujeme za váš zájem o organizaci ${organizationName}. Vaši přihlášku jsme posoudili ${decidedAt} a v tuto chvíli ji bohužel nemůžeme přijmout.`,
      reasonTitle: "Vyjádření posuzovatele",
      deleted:
        "Vaše přihláška i všechny údaje, které jste s ní odeslali, byly smazány. Uchováváme pouze záznam o této zprávě. Pokud se vaše situace změní, můžete se přihlásit znovu.",
      contact: (contactEmail: string) =>
        `Máte-li k tomuto rozhodnutí dotazy, napište na ${contactEmail}.`,
    },

    membershipDeleted: {
      subject: (organizationName: string) =>
        `Vaše členství v organizaci ${organizationName} skončilo`,
      heading: "Vaše členství skončilo",
      greeting: (memberName: string) => `Dobrý den, ${memberName},`,
      body: (organizationName: string, deletedAt: string) =>
        `Vaše členství v organizaci ${organizationName} bylo ${deletedAt} ukončeno. Byli jste odhlášeni a do členského portálu už nemáte přístup.`,
      recordTitle: "Co bude s vaším záznamem",
      record: (purgeAfter: string) =>
        `Váš členský záznam uchováváme do ${purgeAfter} pro případ, že šlo o omyl, a po tomto datu ho trvale smažeme. Pokud má být obnoven, ozvěte se správci ještě před tímto datem.`,
      workspaceTitle: "Váš organizační e-mailový účet",
      workspace: (workspaceEmail: string, purgeAfter: string) =>
        `Účet ${workspaceEmail} stále funguje a bude fungovat do ${purgeAfter}. Využijte tento čas k uložení všeho, co si chcete ponechat — pošty, souborů i fotek.`,
      workspaceHowTo:
        "Google Takeout (takeout.google.com) vyexportuje celý obsah účtu v jednom archivu. Přihlaste se výše uvedenou adresou, ne osobním účtem.",
      workspaceEnds: (purgeAfter: string) =>
        `Po ${purgeAfter} bude účet i vše, co v něm zbylo, smazáno bez možnosti obnovy.`,
      contact: (contactEmail: string) =>
        `Pokud si myslíte, že jde o omyl, napište před tímto datem na ${contactEmail}.`,
    },

    existingAccount: {
      subject: (organizationName: string) =>
        `V organizaci ${organizationName} už členství máte`,
      heading: "Členství už máte",
      greeting: (memberName: string) => `Dobrý den, ${memberName},`,
      body: (organizationName: string, submittedAt: string) =>
        `Dne ${submittedAt} byl s touto e-mailovou adresou odeslán přihlašovací formulář, ale adresa je už v organizaci ${organizationName} registrovaná. Žádná nová přihláška nevznikla a na vašem členství se nic nezměnilo.`,
      cta: "Přejít na přihlášení",
      helpNote:
        "Pokud jste to byli vy a nemůžete se přihlásit, použijte na přihlašovací stránce odkaz Zapomenuté heslo. Pokud jste to nebyli vy, někdo zadal vaši adresu do veřejného formuláře — není třeba nic řešit, ale pokud se to bude opakovat, dejte vědět správci.",
    },
  },
};

export const messages = { en, cs };

export type Locale = keyof typeof messages;

/**
 * Client-safe dictionary lookup.
 *
 * Dictionary entries are functions (Czech grammar needs them), and functions
 * cannot be serialized across the server/client boundary — so a client
 * component takes the `locale` string as its prop and resolves the tree here,
 * inside its own bundle. The server still decides *which* locale; only the tag
 * travels.
 */
export function dictionaryFor(locale: Locale): Dictionary {
  return messages[locale];
}

/**
 * Locale metadata: how each UI language maps onto the two other locale axes.
 *
 *  - `format` is the BCP-47 tag handed to `Intl` for dates, times and money.
 *    It carries a region because "cs" alone leaves `Intl` to pick one, and the
 *    day/month order is the whole point of formatting them.
 *  - `sort` is the ICU collation tag from `lib/collation.ts`, used to seed a new
 *    organization. Collation stays a separate, admin-overridable column: an org
 *    running a Czech interface may hold mostly Slovak or Ukrainian names.
 */
export const LOCALE_META: Record<Locale, { format: string; sort: SortLocaleTag }> =
  {
    en: { format: en.formatLocale, sort: "en-GB" },
    cs: { format: cs.formatLocale, sort: "cs-CZ" },
  };

/** BCP-47 tag for `Intl`. Client-safe. */
export function formatLocaleFor(locale: Locale): string {
  return LOCALE_META[locale].format;
}

/** ICU collation tag used when seeding an organization. */
export function sortLocaleFor(locale: Locale): SortLocaleTag {
  return LOCALE_META[locale].sort;
}
