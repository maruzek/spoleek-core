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
    notAnOption: (label: string) => `${label} must be one of the listed options.`,
    unknownQuestion: "This question is not on the form.",
  },

  /** Group-category selection on the join form. */
  /** Thrown server errors from the portal's join / leave / request actions. */
  portalGroupActions: {
    groupNotFound: "This group is no longer available.",
    alreadyMember: "You are already in this group.",
    notMember: "You are not in this group.",
    joinNotAllowed: "This group cannot be joined on your own. Ask a leader to add you.",
    requestNotAllowed: "You cannot request to join this group right now.",
    requestsBlocked: "A leader has closed further requests for you on this group.",
    requestAlreadyPending: "Your request is already waiting for a leader.",
    noPendingRequest: "There is no pending request to withdraw.",
    leaveNotAllowed: "You cannot leave this group on your own. Ask a leader.",
    leaveSelectionRequired: "You have to be in a group of this category. Join another one first.",
    stateChanged: "The group changed in the meantime. Refresh and try again.",
    requestAlreadyHandled: "This request was already handled.",
    requestNotDeclined: "Only a declined request can be blocked or unblocked.",
  },

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

  forms: {
    portalEyebrow: "Member portal",
    portalTitle: "Forms",
    portalDescription: "Registrations, questionnaires and evaluations your groups have asked you to fill in.",
    sections: { pending: "To fill in", submitted: "Submitted" },
    emptyPending: "Nothing to fill in right now.",
    emptySubmitted: "You have not submitted any forms yet.",
    requiredBadge: "Required",
    optionalBadge: "Optional",
    submittedBadge: "Submitted",
    closesAt: (date: string) => `Closes ${date}`,
    submittedAt: (date: string) => `Submitted ${date}`,
    fillIn: "Fill in",
    view: "View",
    edit: "Edit answers",
    forEvent: (title: string) => `For ${title}`,
    standalone: "Standalone form",
    timing: {
      after_rsvp: "After you answer the invitation",
      before_event: "Before the event",
      during_event: "During the event",
      after_event: "After the event",
      anytime: "Anytime",
    },
    detail: {
      back: "All forms",
      backToEvent: "Back to the event",
      submit: "Submit",
      update: "Save changes",
      saved: "Your answers are saved.",
      updated: "Your answers are updated.",
      alreadySubmitted: (date: string) => `You submitted this on ${date}. You can change your answers while the form is open.`,
      encrypted: "Stored encrypted",
      shredNote: (days: number, anchor: "event" | "deadline") =>
        `deleted ${days} days after the ${anchor === "event" ? "event" : "deadline"}`,
      saveToProfile: "Also save this to my profile",
      savedToProfile: "Saved to your profile as well",
      closed: {
        draft: "This form is not open yet.",
        closed: "This form is closed.",
        deadline_passed: "The deadline for this form has passed.",
        event_cancelled: "The event was cancelled.",
        event_deleted: "The event no longer exists.",
      },
      cannotSubmit: {
        NOT_ELIGIBLE: "This form is not open to you.",
        RSVP_REQUIRED: "Answer the invitation with a yes first, then come back to this form.",
      },
      readOnly: "Your answers are shown for reference.",
    },
    event: {
      title: "Forms",
      pendingHint: (n: number) => (n === 1 ? "1 form to fill in" : `${n} forms to fill in`),
      inlineTitle: "One more thing",
      inlineHint: "The organiser needs a few more details from you.",
      dialogRequired: "Please fill this in to complete your answer.",
      dialogOptional: "You can also do this later from the event page.",
      later: "Later",
    },
    home: {
      title: "Forms to fill in",
      body: (n: number) => (n === 1 ? "1 form is waiting for your answers." : `${n} forms are waiting for your answers.`),
      action: "Open forms",
    },
    errors: {
      FORM_CLOSED: "This form no longer accepts answers.",
      NOT_ELIGIBLE: "This form is not open to you.",
      RSVP_REQUIRED: "Answer the invitation with a yes first.",
      TOKEN_INVALID: "This link is no longer valid.",
      RATE_LIMITED: "Too many attempts. Please try again later.",
      INVALID_ANSWERS: "Check the highlighted answers.",
      NOT_FOUND: "This form could not be found.",
      generic: "Something went wrong. Please try again.",
    },
    public: {
      yourName: "Your name",
      yourEmail: "Your email",
      thanks: "Thank you — your answers are saved.",
      nameRequired: "Name is required.",
      emailInvalid: "Enter a valid email address.",
      fillAfterRsvp: (title: string) => `Fill in: ${title}`,
      openForms: "Forms for this event",
      signInPrompt: "Member?",
      signInLink: "Sign in",
      signInSuffix: "to fill it in from your portal instead.",
    },
    token: {
      fillingAs: (name: string) => `Filling in as ${name}`,
      invalidTitle: "This link is no longer valid",
      invalidBody: "The event may be over, cancelled, or the link has been replaced by a newer one. Ask the organiser for a fresh one.",
    },
  },

  events: {
    portalEyebrow: "Member portal",
    portalTitle: "Events",
    portalDescription: "Invitations for you, open events, and what you have already answered.",
    sections: {
      invited: "You are invited",
      open: "Open to you",
      past: "Past events",
    },
    emptyInvited: "No invitations right now.",
    emptyOpen: "No open events right now.",
    emptyPast: "Nothing here yet.",
    dateTba: "Date to be announced",
    organisedBy: (name: string) => `Organised by ${name}`,
    wholeOrganization: "Whole organization",
    cancelled: "Cancelled",
    answer: { yes: "Going", no: "Not going", maybe: "Maybe" },
    yourAnswer: "Your answer",
    guests: "Guests you are bringing",
    guestsHint: (max: number) => `Up to ${max}.`,
    submit: "Save answer",
    saved: "Answer saved.",
    standing: {
      confirmed: "Your place is confirmed.",
      reserve: "You are on the reserve list — the organiser will confirm your place if one frees up.",
    },
    closed: {
      draft: "This event is not published yet.",
      cancelled: "This event has been cancelled.",
      deadline_passed: "The deadline for answering has passed.",
      event_over: "This event is over.",
    },
    errors: {
      RSVP_CLOSED: "Answers are no longer accepted for this event.",
      NOT_ELIGIBLE: "This event is not open to you.",
      TOO_MANY_GUESTS: "That is more guests than allowed.",
      TOKEN_INVALID: "This link is no longer valid.",
      RATE_LIMITED: "Too many attempts. Please try again later.",
      NOT_FOUND: "This event could not be found.",
      PAYMENT_BANK_ACCOUNT_MISSING:
        "This event has a price but no bank account to pay into. Add one on the event or in the organization's fee settings.",
      PAYMENT_NOT_PENDING: "Only a pending or overdue payment can be changed this way.",
      PAYMENT_NOT_PAID: "Only a payment marked as refund due can be settled.",
      generic: "Something went wrong. Please try again.",
    },
    list: {
      upcoming: "Upcoming",
      past: "Past",
      search: "Search events…",
      filterLabel: "Your answer",
      needsAnswer: "Needs your answer",
      invitedBadge: "Invited",
      cancelledBadge: "Cancelled",
      answered: (n: number) => (n === 1 ? "1 answered" : `${n} answered`),
      waiting: (n: number) => (n === 1 ? "1 waiting for your answer" : `${n} waiting for your answer`),
      nothingUpcoming: "Nothing coming up",
      nothingUpcomingBody: "When your groups plan something, it shows up here.",
      nothingPast: "No past events yet",
      nothingPastBody: "Events you could see land here once they are over.",
      noMatch: "Nothing matches",
      noMatchBody: "Try a different search or loosen the answer filter.",
      answer: "Answer",
      view: "View",
      dateTba: "Date TBA",
      viewList: "List",
      viewCalendar: "Calendar",
      today: "Today",
      previousMonth: "Previous month",
      nextMonth: "Next month",
      showMore: (n: number) => `+${n} more`,
    },
    detail: {
      back: "All events",
      when: "When",
      allDay: "all day",
      answerBy: "Answer by",
      deadlinePassed: "passed",
      noDeadline: "No deadline",
      where: "Where",
      locationTba: "Location to be announced",
      places: "Places",
      placesLeft: (n: number) => (n === 1 ? "1 place left" : `${n} places left`),
      placesFull: "Full — new answers join the reserve list",
      unlimited: "No limit on places",
      guestsAllowed: (n: number) => (n === 1 ? "You may bring 1 guest" : `You may bring up to ${n} guests`),
      goingCount: (n: number) => (n === 1 ? "1 person going" : `${n} people going`),
      chat: "Chat",
      openChat: "Open the event chat",
      price: "Price",
      pricePerPerson: (amount: string) => `${amount} per person`,
      priceGuestsToo: "Guests pay the same.",
      free: "Free",
      noDescription: "The organiser has not added any details yet.",
      yourStatus: {
        going: "You're going",
        reserve: "On the reserve list",
        maybe: "You said maybe",
        no: "Not going",
      },
      cancelledTitle: "This event has been cancelled",
      cancelledBody: "Your answer is kept for the record, but nothing will take place.",
      reserveTitle: "You're on the reserve list",
      reserveBody: "The event is full. If a place frees up, the organiser will confirm you and you will hear from them.",
      answerPrompt: "Will you come?",
      answerHint: "You can change your answer any time before the deadline.",
      guestsLabel: "Guests",
      fewer: "Fewer guests",
      more: "More guests",
      party: (n: number) => (n === 1 ? "Just you" : `You + ${n - 1}`),
      payment: {
        reserveTitle: "No payment needed yet",
        reserveBody: "You are on the reserve list. Payment details appear here once the organiser confirms your place.",
        guestPrompt: "Payment details are on the page behind your link, and in the email we sent you.",
      },
    },
    public: {
      yourName: "Your name",
      yourEmail: "Your email",
      emailHint: "Used only to keep your answer; no account is created.",
      thanks: "Thank you — your answer is saved.",
      changeLater: "Keep this link to change your answer later:",
      copyLink: "Copy link",
      linkCopied: "Link copied.",
      signInHint: "Member? Sign in to answer from your portal instead.",
      signInPrompt: "Member?",
      signInLink: "Sign in",
      signInSuffix: "to answer from your portal instead.",
    },
    token: {
      answeringAs: (name: string) => `Answering as ${name}`,
      invalidTitle: "This link is no longer valid",
      invalidBody: "The event may be over, cancelled, or the link has been replaced by a newer invitation. Ask the organiser for a fresh one.",
    },
  },

  payments: {
    /** The QR/receipt card a member sees for one payment. */
    card: {
      membershipFee: "Membership fee",
      eventFee: "Event fee",
      statePending: "Waiting for your payment",
      stateOverdue: "Payment overdue",
      statePaid: "Paid",
      stateRefundDue: "Refund on its way",
      stateCancelled: "Cancelled",
      dueBy: (date: string) => `Pay by ${date}`,
      overdueSince: (date: string) => `Was due ${date}`,
      paidOn: (date: string) => `Paid on ${date}`,
      refundBody: "You paid, but your place is no longer confirmed. The organiser will return the money and contact you.",
      scanToPay: "Scan with your banking app",
      bankAccount: "Bank account",
      bankCode: "Bank code",
      variableSymbol: "Variable symbol",
      payer: "Payer",
      copy: (what: string) => `Copy ${what.toLowerCase()}`,
      showDetails: "Show payment details",
      noAccount: "The organisation has not set up a bank account yet — ask the organiser how to pay.",
    },
  },

  /** The admin ⌘K palette and the header search that opens it. */
  commandPalette: {
    searchButton: "Search…",
    title: "Command palette",
    description: "Search the organization or run a command.",
    placeholder: "Search members, groups, events, settings… or type a command",
    searching: "Searching…",
    noResults: "No results.",
    typeMore: (count: number) => `Type at least ${count} characters to search records.`,
    seeAll: (count: number, where: string) => `See all ${count} results in ${where}`,
    groups: {
      navigation: "Go to",
      settings: "Settings",
      actions: "Quick actions",
      thisPage: "On this page",
      members: "Members",
      groups: "Groups",
      categories: "Group categories",
      events: "Events",
      reports: "Membership reports",
      policies: "Legal documents",
      forms: "Forms",
    },
    nav: {
      dashboard: "Dashboard",
      members: "Members",
      groups: "Groups",
      events: "Events",
      forms: "Forms",
      payments: "Payments",
      reports: "Reports",
      email: "Email",
      emailHealth: "Email health",
      settings: "Settings",
      settingsWorkspace: "Settings → Workspace",
      settingsMembership: "Settings → Membership",
      settingsCustomFields: "Settings → Custom fields",
      settingsJoin: "Settings → Join page",
      settingsLegal: "Settings → Legal",
      settingsNotifications: "Settings → Notifications",
      settingsEvents: "Settings → Events",
      settingsGroups: "Settings → Groups",
      settingsLocalization: "Settings → Localization",
    },
    actions: {
      newMember: "New member",
      newGroup: "New group",
      newCategory: "New group category",
      newEvent: "New event",
      importMembers: "Import members",
      openReport: "Open this year's membership report",
      resendInvite: "Resend invite to this member",
      inviteSent: "Invite sent.",
      inviteFailed: "The invite could not be sent.",
      exportMember: "Export this member's data",
      exportDone: "Data export downloaded.",
      exportFailed: "Could not build the export.",
      toggleTheme: "Toggle theme",
      myProfile: "My profile",
      signOut: "Sign out",
    },
    settingsHint: {
      newGroup: "Pick a category first",
    },
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
    eventInvite: {
      subject: (organizationName: string, eventTitle: string) =>
        `${organizationName}: you are invited to ${eventTitle}`,
      heading: (eventTitle: string) => `You are invited: ${eventTitle}`,
      greeting: (name: string) => `Hello ${name},`,
      body: (organizationName: string) =>
        `${organizationName} would like to know whether you are coming. Use the button below to answer — no sign-in needed.`,
      whenTitle: "When",
      whereTitle: "Where",
      deadline: (date: string) => `Please answer by ${date}.`,
      rsvp: "Answer the invitation",
      communication: "Join the event chat",
      fallbackIntro: "If the button does not open, paste this URL into your browser:",
      keepThis: "This link is personal to you. Anyone who has it can answer in your name, so do not forward it.",
    },

    formReminder: {
      subject: (organizationName: string, formTitle: string) =>
        `${organizationName}: please fill in ${formTitle}`,
      heading: (formTitle: string) => `Please fill in: ${formTitle}`,
      greeting: (name: string) => `Hello ${name},`,
      body: (organizationName: string) =>
        `${organizationName} is still waiting for your answers. Use the button below to fill in the form.`,
      eventTitle: "For the event",
      deadline: (date: string) => `Please answer by ${date}.`,
      open: "Fill in the form",
      fallbackIntro: "If the button does not open, paste this URL into your browser:",
      keepThis: "This link is personal to you. Anyone who has it can answer in your name, so do not forward it.",
      signIn: "Sign in to the member portal to fill it in.",
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

    /** To the approvers: a member asked to join a group. */
    joinRequest: {
      subject: (memberName: string, groupName: string) =>
        `${memberName} asked to join ${groupName}`,
      heading: "New request to join a group",
      body: (memberName: string, groupName: string, requestedAt: string) =>
        `${memberName} asked to join ${groupName} on ${requestedAt}.`,
      messageTitle: "Their message",
      noMessage: "They did not add a message.",
      cta: "Review the request",
      footer:
        "You are receiving this because you lead this group or its category. Join-request alerts are managed in the organization settings.",
    },

    /** To the member: what the leaders decided. */
    joinDecision: {
      approvedSubject: (groupName: string) => `You are now in ${groupName}`,
      declinedSubject: (groupName: string) => `About your request to join ${groupName}`,
      approvedHeading: "Welcome to the group",
      declinedHeading: "About your request",
      greeting: (memberName: string) => `Hello ${memberName},`,
      approvedBody: (groupName: string, organizationName: string, decidedAt: string) =>
        `A leader approved your request to join ${groupName} in ${organizationName} on ${decidedAt}. You will now see the group's events and notices in your portal.`,
      declinedBody: (groupName: string, organizationName: string, decidedAt: string) =>
        `Your request to join ${groupName} in ${organizationName} was reviewed on ${decidedAt} and was not approved.`,
      reasonTitle: "From the leader",
      cta: "Open your groups",
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
    notAnOption: (label: string) =>
      `${csField(label)} musí být jedna z nabízených možností.`,
    unknownQuestion: "Tato otázka ve formuláři není.",
  },

  portalGroupActions: {
    groupNotFound: "Tato skupina již není k dispozici.",
    alreadyMember: "V této skupině již jste.",
    notMember: "V této skupině nejste.",
    joinNotAllowed: "Do této skupiny se nelze přidat sami. Požádejte vedoucího, aby vás přidal.",
    requestNotAllowed: "O vstup do této skupiny teď nemůžete požádat.",
    requestsBlocked: "Vedoucí u této skupiny další žádosti od vás uzavřel.",
    requestAlreadyPending: "Vaše žádost už čeká na vedoucího.",
    noPendingRequest: "Není žádná čekající žádost, kterou by šlo stáhnout.",
    leaveNotAllowed: "Z této skupiny nelze odejít sami. Požádejte vedoucího.",
    leaveSelectionRequired: "V některé skupině této kategorie musíte být. Nejdříve se přidejte do jiné.",
    stateChanged: "Skupina se mezitím změnila. Obnovte stránku a zkuste to znovu.",
    requestAlreadyHandled: "Tato žádost už byla vyřízena.",
    requestNotDeclined: "Blokovat nebo odblokovat lze jen zamítnutou žádost.",
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

  forms: {
    portalEyebrow: "Členský portál",
    portalTitle: "Formuláře",
    portalDescription: "Přihlášky, dotazníky a hodnocení, o jejichž vyplnění vás vaše skupiny požádaly.",
    sections: { pending: "K vyplnění", submitted: "Odesláno" },
    emptyPending: "Momentálně není co vyplnit.",
    emptySubmitted: "Zatím jste neodeslali žádný formulář.",
    requiredBadge: "Povinný",
    optionalBadge: "Nepovinný",
    submittedBadge: "Odesláno",
    closesAt: (date: string) => `Uzávěrka ${date}`,
    submittedAt: (date: string) => `Odesláno ${date}`,
    fillIn: "Vyplnit",
    view: "Zobrazit",
    edit: "Upravit odpovědi",
    forEvent: (title: string) => `K akci ${title}`,
    standalone: "Samostatný formulář",
    timing: {
      after_rsvp: "Po odpovědi na pozvánku",
      before_event: "Před akcí",
      during_event: "Během akce",
      after_event: "Po akci",
      anytime: "Kdykoli",
    },
    detail: {
      back: "Všechny formuláře",
      backToEvent: "Zpět na akci",
      submit: "Odeslat",
      update: "Uložit změny",
      saved: "Vaše odpovědi jsou uloženy.",
      updated: "Vaše odpovědi jsou aktualizovány.",
      alreadySubmitted: (date: string) => `Odesláno ${date}. Dokud je formulář otevřený, můžete odpovědi měnit.`,
      encrypted: "Uloženo šifrovaně",
      shredNote: (days: number, anchor: "event" | "deadline") =>
        `smazáno ${days} dní po ${anchor === "event" ? "akci" : "uzávěrce"}`,
      saveToProfile: "Uložit také do mého profilu",
      savedToProfile: "Uloží se i do vašeho profilu",
      closed: {
        draft: "Tento formulář ještě není otevřený.",
        closed: "Tento formulář je uzavřený.",
        deadline_passed: "Uzávěrka tohoto formuláře už proběhla.",
        event_cancelled: "Akce byla zrušena.",
        event_deleted: "Akce už neexistuje.",
      },
      cannotSubmit: {
        NOT_ELIGIBLE: "Tento formulář pro vás není určen.",
        RSVP_REQUIRED: "Nejdřív odpovězte na pozvánku, že přijdete, a pak se vraťte k formuláři.",
      },
      readOnly: "Vaše odpovědi jsou zobrazeny pro informaci.",
    },
    event: {
      title: "Formuláře",
      pendingHint: (n: number) => (n === 1 ? "1 formulář k vyplnění" : `${n} formulářů k vyplnění`),
      inlineTitle: "Ještě jedna věc",
      inlineHint: "Pořadatel od vás potřebuje ještě pár údajů.",
      dialogRequired: "Vyplňte prosím tento formulář, aby byla vaše odpověď úplná.",
      dialogOptional: "Můžete to udělat i později ze stránky akce.",
      later: "Později",
    },
    home: {
      title: "Formuláře k vyplnění",
      body: (n: number) => (n === 1 ? "1 formulář čeká na vaše odpovědi." : `${n} formulářů čeká na vaše odpovědi.`),
      action: "Otevřít formuláře",
    },
    errors: {
      FORM_CLOSED: "Tento formulář už nepřijímá odpovědi.",
      NOT_ELIGIBLE: "Tento formulář pro vás není určen.",
      RSVP_REQUIRED: "Nejdřív odpovězte na pozvánku, že přijdete.",
      TOKEN_INVALID: "Tento odkaz už není platný.",
      RATE_LIMITED: "Příliš mnoho pokusů. Zkuste to prosím později.",
      INVALID_ANSWERS: "Zkontrolujte označené odpovědi.",
      NOT_FOUND: "Formulář se nepodařilo najít.",
      generic: "Něco se pokazilo. Zkuste to prosím znovu.",
    },
    public: {
      yourName: "Vaše jméno",
      yourEmail: "Váš e-mail",
      thanks: "Děkujeme — vaše odpovědi jsou uloženy.",
      nameRequired: "Vyplňte jméno.",
      emailInvalid: "Zadejte platnou e-mailovou adresu.",
      fillAfterRsvp: (title: string) => `Vyplnit: ${title}`,
      openForms: "Formuláře k této akci",
      signInPrompt: "Jste členem?",
      signInLink: "Přihlaste se",
      signInSuffix: "a vyplňte formulář v portálu.",
    },
    token: {
      fillingAs: (name: string) => `Vyplňujete jako ${name}`,
      invalidTitle: "Tento odkaz už není platný",
      invalidBody: "Akce možná skončila, byla zrušena, nebo byl odkaz nahrazen novějším. Požádejte pořadatele o nový.",
    },
  },

  events: {
    portalEyebrow: "Členský portál",
    portalTitle: "Akce",
    portalDescription: "Pozvánky pro vás, otevřené akce a to, na co jste už odpověděli.",
    sections: {
      invited: "Jste pozváni",
      open: "Otevřené pro vás",
      past: "Proběhlé akce",
    },
    emptyInvited: "Momentálně žádné pozvánky.",
    emptyOpen: "Momentálně žádné otevřené akce.",
    emptyPast: "Zatím nic.",
    dateTba: "Termín bude upřesněn",
    organisedBy: (name: string) => `Pořádá ${name}`,
    wholeOrganization: "Celá organizace",
    cancelled: "Zrušeno",
    answer: { yes: "Přijdu", no: "Nepřijdu", maybe: "Možná" },
    yourAnswer: "Vaše odpověď",
    guests: "Kolik hostů přivedete",
    guestsHint: (max: number) => `Nejvýše ${max}.`,
    submit: "Uložit odpověď",
    saved: "Odpověď uložena.",
    standing: {
      confirmed: "Vaše místo je potvrzeno.",
      reserve: "Jste na seznamu náhradníků — pokud se uvolní místo, pořadatel vás potvrdí.",
    },
    closed: {
      draft: "Tato akce ještě není zveřejněna.",
      cancelled: "Tato akce byla zrušena.",
      deadline_passed: "Lhůta pro odpověď vypršela.",
      event_over: "Tato akce už proběhla.",
    },
    errors: {
      RSVP_CLOSED: "Odpovědi na tuto akci se už nepřijímají.",
      NOT_ELIGIBLE: "Tato akce pro vás není určena.",
      TOO_MANY_GUESTS: "To je víc hostů, než je povoleno.",
      TOKEN_INVALID: "Tento odkaz už není platný.",
      RATE_LIMITED: "Příliš mnoho pokusů. Zkuste to prosím později.",
      NOT_FOUND: "Akce nebyla nalezena.",
      PAYMENT_BANK_ACCOUNT_MISSING:
        "Akce má cenu, ale není kam platit. Doplňte bankovní účet u akce nebo v nastavení příspěvků organizace.",
      PAYMENT_NOT_PENDING: "Takto lze změnit jen čekající nebo zpožděnou platbu.",
      PAYMENT_NOT_PAID: "Vypořádat lze jen platbu označenou k vrácení.",
      generic: "Něco se pokazilo. Zkuste to prosím znovu.",
    },
    list: {
      upcoming: "Nadcházející",
      past: "Proběhlé",
      search: "Hledat akce…",
      filterLabel: "Vaše odpověď",
      needsAnswer: "Čeká na vaši odpověď",
      invitedBadge: "Pozvánka",
      cancelledBadge: "Zrušeno",
      answered: (n: number) => (n === 1 ? "1 zodpovězená" : n < 5 ? `${n} zodpovězené` : `${n} zodpovězených`),
      waiting: (n: number) => (n === 1 ? "1 čeká na vaši odpověď" : n < 5 ? `${n} čekají na vaši odpověď` : `${n} čeká na vaši odpověď`),
      nothingUpcoming: "Nic nadcházejícího",
      nothingUpcomingBody: "Až vaše skupiny něco naplánují, objeví se to tady.",
      nothingPast: "Zatím žádné proběhlé akce",
      nothingPastBody: "Akce, které jste mohli vidět, se sem přesunou po skončení.",
      noMatch: "Nic neodpovídá",
      noMatchBody: "Zkuste jiné hledání nebo uvolněte filtr odpovědí.",
      answer: "Odpovědět",
      view: "Zobrazit",
      dateTba: "Termín bude upřesněn",
      viewList: "Seznam",
      viewCalendar: "Kalendář",
      today: "Dnes",
      previousMonth: "Předchozí měsíc",
      nextMonth: "Další měsíc",
      showMore: (n: number) => `+${n} další`,
    },
    detail: {
      back: "Všechny akce",
      when: "Kdy",
      allDay: "celý den",
      answerBy: "Odpovězte do",
      deadlinePassed: "vypršelo",
      noDeadline: "Bez lhůty",
      where: "Kde",
      locationTba: "Místo bude upřesněno",
      places: "Místa",
      placesLeft: (n: number) =>
        n === 1 ? "Zbývá 1 místo" : n < 5 ? `Zbývají ${n} místa` : `Zbývá ${n} míst`,
      placesFull: "Obsazeno — nové odpovědi jdou mezi náhradníky",
      unlimited: "Bez omezení míst",
      guestsAllowed: (n: number) =>
        n === 1 ? "Můžete přivést 1 hosta" : n < 5 ? `Můžete přivést až ${n} hosty` : `Můžete přivést až ${n} hostů`,
      goingCount: (n: number) => (n === 1 ? "1 člověk přijde" : n < 5 ? `${n} lidé přijdou` : `${n} lidí přijde`),
      chat: "Chat",
      openChat: "Otevřít chat akce",
      price: "Cena",
      pricePerPerson: (amount: string) => `${amount} za osobu`,
      priceGuestsToo: "Hosté platí stejně.",
      free: "Zdarma",
      noDescription: "Pořadatel zatím nepřidal žádné podrobnosti.",
      yourStatus: {
        going: "Přijdete",
        reserve: "Mezi náhradníky",
        maybe: "Odpověděli jste možná",
        no: "Nepřijdete",
      },
      cancelledTitle: "Tato akce byla zrušena",
      cancelledBody: "Vaše odpověď zůstává uložena, ale akce se neuskuteční.",
      reserveTitle: "Jste mezi náhradníky",
      reserveBody: "Akce je obsazená. Pokud se uvolní místo, pořadatel vás potvrdí a dá vám vědět.",
      answerPrompt: "Přijdete?",
      answerHint: "Odpověď můžete kdykoli před uzávěrkou změnit.",
      guestsLabel: "Hosté",
      fewer: "Méně hostů",
      more: "Více hostů",
      party: (n: number) => (n === 1 ? "Jen vy" : `Vy + ${n - 1}`),
      payment: {
        reserveTitle: "Zatím není co platit",
        reserveBody: "Jste mezi náhradníky. Platební údaje se tu objeví, jakmile vám pořadatel potvrdí místo.",
        guestPrompt: "Platební údaje najdete na stránce za svým odkazem a v e-mailu, který jsme vám poslali.",
      },
    },
    public: {
      yourName: "Vaše jméno",
      yourEmail: "Váš e-mail",
      emailHint: "Slouží jen k uložení vaší odpovědi; žádný účet se nevytváří.",
      thanks: "Děkujeme — vaše odpověď je uložena.",
      changeLater: "Tento odkaz si uschovejte, pokud budete chtít odpověď změnit:",
      copyLink: "Kopírovat odkaz",
      linkCopied: "Odkaz zkopírován.",
      signInHint: "Jste člen? Přihlaste se a odpovězte v portálu.",
      signInPrompt: "Jste člen?",
      signInLink: "Přihlaste se",
      signInSuffix: "a odpovězte v portálu.",
    },
    token: {
      answeringAs: (name: string) => `Odpovídáte jako ${name}`,
      invalidTitle: "Tento odkaz už není platný",
      invalidBody: "Akce možná proběhla, byla zrušena, nebo byl odkaz nahrazen novější pozvánkou. Požádejte pořadatele o nový.",
    },
  },

  payments: {
    card: {
      membershipFee: "Členský příspěvek",
      eventFee: "Poplatek za akci",
      statePending: "Čeká na vaši platbu",
      stateOverdue: "Platba po splatnosti",
      statePaid: "Zaplaceno",
      stateRefundDue: "Vrátíme vám peníze",
      stateCancelled: "Zrušeno",
      dueBy: (date: string) => `Zaplaťte do ${date}`,
      overdueSince: (date: string) => `Splatnost byla ${date}`,
      paidOn: (date: string) => `Zaplaceno ${date}`,
      refundBody: "Zaplatili jste, ale vaše místo už není potvrzené. Pořadatel vám peníze vrátí a ozve se vám.",
      scanToPay: "Naskenujte v bankovní aplikaci",
      bankAccount: "Číslo účtu",
      bankCode: "Kód banky",
      variableSymbol: "Variabilní symbol",
      payer: "Plátce",
      copy: (what: string) => `Kopírovat ${what.toLowerCase()}`,
      showDetails: "Zobrazit platební údaje",
      noAccount: "Organizace zatím nemá nastavený bankovní účet — zeptejte se pořadatele, jak zaplatit.",
    },
  },

  commandPalette: {
    searchButton: "Hledat…",
    title: "Příkazová paleta",
    description: "Prohledejte organizaci nebo spusťte příkaz.",
    placeholder: "Hledejte členy, skupiny, akce, nastavení… nebo zadejte příkaz",
    searching: "Hledám…",
    noResults: "Nic nenalezeno.",
    typeMore: (count: number) => `Pro hledání v záznamech zadejte alespoň ${count} ${csCharacters(count)}.`,
    seeAll: (count: number, where: string) => `Zobrazit všech ${count} výsledků v sekci ${where}`,
    groups: {
      navigation: "Přejít na",
      settings: "Nastavení",
      actions: "Rychlé akce",
      thisPage: "Na této stránce",
      members: "Členové",
      groups: "Skupiny",
      categories: "Kategorie skupin",
      events: "Akce",
      reports: "Výkazy členů",
      policies: "Právní dokumenty",
      forms: "Formuláře",
    },
    nav: {
      dashboard: "Přehled",
      members: "Členové",
      groups: "Skupiny",
      events: "Akce",
      forms: "Formuláře",
      payments: "Platby",
      reports: "Výkazy",
      email: "E-mail",
      emailHealth: "Stav e-mailu",
      settings: "Nastavení",
      settingsWorkspace: "Nastavení → Workspace",
      settingsMembership: "Nastavení → Členství",
      settingsCustomFields: "Nastavení → Vlastní pole",
      settingsJoin: "Nastavení → Přihláška",
      settingsLegal: "Nastavení → Právní dokumenty",
      settingsNotifications: "Nastavení → Upozornění",
      settingsEvents: "Nastavení → Akce",
      settingsGroups: "Nastavení → Skupiny",
      settingsLocalization: "Nastavení → Lokalizace",
    },
    actions: {
      newMember: "Nový člen",
      newGroup: "Nová skupina",
      newCategory: "Nová kategorie skupin",
      newEvent: "Nová akce",
      importMembers: "Import členů",
      openReport: "Otevřít letošní výkaz členů",
      resendInvite: "Znovu poslat pozvánku tomuto členovi",
      inviteSent: "Pozvánka odeslána.",
      inviteFailed: "Pozvánku se nepodařilo odeslat.",
      exportMember: "Exportovat data tohoto člena",
      exportDone: "Export dat stažen.",
      exportFailed: "Export se nepodařilo vytvořit.",
      toggleTheme: "Přepnout vzhled",
      myProfile: "Můj profil",
      signOut: "Odhlásit se",
    },
    settingsHint: {
      newGroup: "Nejdřív vyberte kategorii",
    },
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
    eventInvite: {
      subject: (organizationName: string, eventTitle: string) =>
        `${organizationName}: pozvánka na ${eventTitle}`,
      heading: (eventTitle: string) => `Pozvánka: ${eventTitle}`,
      greeting: (name: string) => `Dobrý den, ${name},`,
      body: (organizationName: string) =>
        `Organizace ${organizationName} by ráda věděla, zda dorazíte. Odpovězte tlačítkem níže — přihlášení není potřeba.`,
      whenTitle: "Kdy",
      whereTitle: "Kde",
      deadline: (date: string) => `Odpovězte prosím do ${date}.`,
      rsvp: "Odpovědět na pozvánku",
      communication: "Připojit se ke skupinovému chatu",
      fallbackIntro: "Pokud tlačítko nefunguje, vložte tuto adresu do prohlížeče:",
      keepThis: "Tento odkaz je osobní. Kdokoli, kdo jej má, může odpovědět vaším jménem, proto jej nepřeposílejte.",
    },

    formReminder: {
      subject: (organizationName: string, formTitle: string) =>
        `${organizationName}: prosíme o vyplnění ${formTitle}`,
      heading: (formTitle: string) => `Prosíme o vyplnění: ${formTitle}`,
      greeting: (name: string) => `Dobrý den, ${name},`,
      body: (organizationName: string) =>
        `Organizace ${organizationName} stále čeká na vaše odpovědi. Formulář vyplníte tlačítkem níže.`,
      eventTitle: "K akci",
      deadline: (date: string) => `Odpovězte prosím do ${date}.`,
      open: "Vyplnit formulář",
      fallbackIntro: "Pokud tlačítko nefunguje, vložte tuto adresu do prohlížeče:",
      keepThis: "Tento odkaz je osobní. Kdokoli, kdo jej má, může odpovědět vaším jménem, proto jej nepřeposílejte.",
      signIn: "Přihlaste se do členského portálu a formulář vyplňte tam.",
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

    joinRequest: {
      subject: (memberName: string, groupName: string) =>
        `${memberName} žádá o vstup do skupiny ${groupName}`,
      heading: "Nová žádost o vstup do skupiny",
      body: (memberName: string, groupName: string, requestedAt: string) =>
        `${memberName} požádal(a) ${requestedAt} o vstup do skupiny ${groupName}.`,
      messageTitle: "Zpráva od žadatele",
      noMessage: "Žadatel nepřipojil žádnou zprávu.",
      cta: "Posoudit žádost",
      footer:
        "Tento e-mail dostáváte, protože vedete tuto skupinu nebo její kategorii. Upozornění na žádosti se nastavují v nastavení organizace.",
    },

    joinDecision: {
      approvedSubject: (groupName: string) => `Jste ve skupině ${groupName}`,
      declinedSubject: (groupName: string) => `K vaší žádosti o vstup do skupiny ${groupName}`,
      approvedHeading: "Vítejte ve skupině",
      declinedHeading: "K vaší žádosti",
      greeting: (memberName: string) => `Dobrý den, ${memberName},`,
      approvedBody: (groupName: string, organizationName: string, decidedAt: string) =>
        `Vedoucí ${decidedAt} schválil(a) vaši žádost o vstup do skupiny ${groupName} (${organizationName}). Ve svém portálu teď uvidíte akce a oznámení této skupiny.`,
      declinedBody: (groupName: string, organizationName: string, decidedAt: string) =>
        `Vaši žádost o vstup do skupiny ${groupName} (${organizationName}) jsme posoudili ${decidedAt} a nebyla schválena.`,
      reasonTitle: "Vyjádření vedoucího",
      cta: "Otevřít moje skupiny",
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
