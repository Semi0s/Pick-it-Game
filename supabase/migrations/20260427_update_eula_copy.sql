update public.legal_documents
set
  required_version = '2026-04-26-v2',
  title = 'PICK-IT! Terms of Use',
  body = $$PICK-IT! Terms of Use

Last updated: April 26, 2026

Welcome to PICK-IT! This game is built to be fun, social, and fair. By creating an account or using the app, you agree to these Terms of Use.

1. About the Game

PICK-IT! is a prediction game for the 2026 World Cup. Players make match predictions, join groups, compare scores, and appear on leaderboards.

The game is for entertainment purposes only.

2. Accounts

You are responsible for the accuracy of your account information and for keeping your login secure.

You may not impersonate another person, create disruptive accounts, or interfere with other players' ability to enjoy the game.

3. Predictions and Scoring

Players are responsible for making their own picks before the applicable deadline.

Picks may lock before or at match kickoff.

Scoring is based on the rules displayed in the app. PICK-IT! may correct scores, standings, match data, or leaderboard results if errors are found.

Final scoring decisions are made by the app administrator.

4. Groups and Leaderboards

Players may join private groups by invitation or approval.

Group managers may invite players, manage group participation, and view group activity according to the permissions provided in the app.

Leaderboards are provided for fun and may change as scores are updated, corrected, or finalized.

5. Fair Play

You agree not to abuse the app, attempt to manipulate scoring, access another user's account, interfere with the system, or use the app in a way that harms other players or the service.

We may suspend or remove accounts that violate these terms or disrupt the game.

6. No Gambling

PICK-IT! is not intended to be a gambling platform.

Unless clearly stated otherwise in official rules, no purchase, wager, or paid entry is required to participate.

Do not use PICK-IT! for unauthorized betting, gambling, or paid pools.

7. App Availability

We do our best to keep PICK-IT! running smoothly, but the app may occasionally be unavailable, delayed, inaccurate, or interrupted.

We are not responsible for missed picks, lost data, delayed updates, scoring delays, or technical issues beyond our reasonable control.

8. Changes to the Game

We may update the app, scoring system, rules, features, or these Terms as the game grows.

If a new version of these Terms is required, you may need to accept it before continuing to use the app.

9. Privacy

Your use of PICK-IT! is also subject to our Privacy Policy.

We collect and use information needed to operate the game, manage accounts, send invitations, display leaderboards, and improve the experience.

10. Limitation of Liability

PICK-IT! is provided "as is" and "as available."

To the fullest extent allowed by law, we are not liable for indirect, incidental, special, consequential, or punitive damages related to your use of the app.

11. Contact

For questions about these Terms, contact the PICK-IT! administrator.

Acceptance

By checking the box and continuing, you confirm that you have read and agree to these Terms of Use.$$,
  updated_at = now()
where document_type = 'eula';
