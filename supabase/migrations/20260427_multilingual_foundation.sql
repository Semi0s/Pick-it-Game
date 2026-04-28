alter table public.users
add column if not exists preferred_language text not null default 'en';

alter table public.legal_documents
add column if not exists language text not null default 'en';

alter table public.user_legal_acceptances
add column if not exists language text not null default 'en';

update public.users
set preferred_language = 'en'
where preferred_language is null or preferred_language = '';

update public.legal_documents
set language = 'en'
where language is null or language = '';

update public.user_legal_acceptances
set language = 'en'
where language is null or language = '';

alter table public.legal_documents
drop constraint if exists legal_documents_document_type_key;

drop index if exists user_legal_acceptances_user_doc_version_unique_idx;

create unique index if not exists legal_documents_document_type_language_unique_idx
  on public.legal_documents (document_type, language);

create unique index if not exists user_legal_acceptances_user_doc_version_language_unique_idx
  on public.user_legal_acceptances (user_id, document_type, document_version, language);

insert into public.legal_documents (
  document_type,
  language,
  required_version,
  title,
  body,
  is_active
)
values
(
  'eula',
  'en',
  '2026-04-26-v2-en',
  'PICK-IT! Terms of Use',
  $$PICK-IT! Terms of Use

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
  true
),
(
  'eula',
  'es',
  '2026-04-26-v2-es',
  'Términos de Uso de PICK-IT!',
  $$Términos de Uso de PICK-IT!

Última actualización: 26 de abril de 2026

Bienvenido a PICK-IT! Este juego está hecho para ser divertido, social y justo. Al crear una cuenta o usar la aplicación, aceptas estos Términos de Uso.

1. Sobre el Juego

PICK-IT! es un juego de predicciones para la Copa Mundial 2026. Los jugadores hacen predicciones de partidos, se unen a grupos, comparan puntajes y aparecen en tablas de posiciones.

El juego es solo para fines de entretenimiento.

2. Cuentas

Eres responsable de la exactitud de la información de tu cuenta y de mantener tu acceso seguro.

No puedes hacerte pasar por otra persona, crear cuentas disruptivas ni interferir con la capacidad de otros jugadores para disfrutar del juego.

3. Predicciones y Puntuación

Los jugadores son responsables de hacer sus propias predicciones antes de la fecha límite correspondiente.

Las predicciones pueden bloquearse antes o en el momento en que comience el partido.

La puntuación se basa en las reglas que se muestran en la aplicación. PICK-IT! puede corregir puntajes, clasificaciones, datos de partidos o resultados de tablas si se encuentran errores.

Las decisiones finales de puntuación las toma el administrador de la aplicación.

4. Grupos y Tablas de Posiciones

Los jugadores pueden unirse a grupos privados por invitación o aprobación.

Los administradores de grupo pueden invitar jugadores, gestionar la participación del grupo y ver la actividad del grupo según los permisos disponibles en la aplicación.

Las tablas de posiciones se ofrecen para divertirse y pueden cambiar a medida que los puntajes se actualicen, corrijan o finalicen.

5. Juego Limpio

Aceptas no abusar de la aplicación, intentar manipular la puntuación, acceder a la cuenta de otro usuario, interferir con el sistema ni usar la aplicación de una manera que perjudique a otros jugadores o al servicio.

Podemos suspender o eliminar cuentas que violen estos términos o alteren el juego.

6. No es Apuestas

PICK-IT! no está diseñado para ser una plataforma de apuestas.

A menos que se indique claramente lo contrario en reglas oficiales, no se requiere compra, apuesta ni pago para participar.

No uses PICK-IT! para apuestas no autorizadas, juegos de azar ni pozos pagados.

7. Disponibilidad de la Aplicación

Hacemos todo lo posible para que PICK-IT! funcione sin problemas, pero la aplicación puede estar ocasionalmente no disponible, retrasada, inexacta o interrumpida.

No somos responsables por predicciones perdidas, datos perdidos, actualizaciones tardías, retrasos en la puntuación ni problemas técnicos fuera de nuestro control razonable.

8. Cambios en el Juego

Podemos actualizar la aplicación, el sistema de puntuación, las reglas, las funciones o estos Términos a medida que el juego crece.

Si se requiere una nueva versión de estos Términos, es posible que debas aceptarla antes de continuar usando la aplicación.

9. Privacidad

Tu uso de PICK-IT! también está sujeto a nuestra Política de Privacidad.

Recopilamos y usamos la información necesaria para operar el juego, gestionar cuentas, enviar invitaciones, mostrar tablas de posiciones y mejorar la experiencia.

10. Limitación de Responsabilidad

PICK-IT! se ofrece "tal cual" y "según disponibilidad".

En la máxima medida permitida por la ley, no somos responsables por daños indirectos, incidentales, especiales, consecuentes o punitivos relacionados con tu uso de la aplicación.

11. Contacto

Si tienes preguntas sobre estos Términos, comunícate con el administrador de PICK-IT!.

Aceptación

Al marcar la casilla y continuar, confirmas que has leído y aceptas estos Términos de Uso.$$,
  true
)
on conflict (document_type, language) do update
set
  required_version = excluded.required_version,
  title = excluded.title,
  body = excluded.body,
  is_active = excluded.is_active,
  updated_at = now();
