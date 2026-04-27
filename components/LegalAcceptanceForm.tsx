"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { acceptCurrentLegalDocumentAction } from "@/app/legal/actions";

const SPANISH_EULA_BODY = `Términos de Uso de PICK-IT!

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

Al marcar la casilla y continuar, confirmas que has leído y aceptas estos Términos de Uso.`;

export function LegalAcceptanceForm({
  documentType,
  currentVersion,
  title,
  body,
  nextPath,
  alreadyAccepted
}: {
  documentType: string;
  currentVersion: string;
  title: string;
  body: string;
  nextPath?: string;
  alreadyAccepted?: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEnglishOpen, setIsEnglishOpen] = useState(false);
  const [isSpanishOpen, setIsSpanishOpen] = useState(false);
  const [hasOpenedEnglish, setHasOpenedEnglish] = useState(false);
  const [hasOpenedSpanish, setHasOpenedSpanish] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    alreadyAccepted ? { tone: "success", text: "You already accepted the current version." } : null
  );
  const hasOpenedBothVersions = hasOpenedEnglish && hasOpenedSpanish;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  return (
    <section className="space-y-5">
      <div className="rounded-lg bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Terms</p>
        <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">{title}</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">
          Version {currentVersion}. We need your agreement before you can keep using PICK-IT!
        </p>
      </div>

      <LegalDisclosureCard
        title="Terms of Use"
        subtitle="English"
        open={isEnglishOpen}
        onToggle={() => {
          setIsEnglishOpen((current) => !current);
          setHasOpenedEnglish(true);
        }}
        body={body}
      />

      <LegalDisclosureCard
        title="Términos de Uso"
        subtitle="Español"
        open={isSpanishOpen}
        onToggle={() => {
          setIsSpanishOpen((current) => !current);
          setHasOpenedSpanish(true);
        }}
        body={SPANISH_EULA_BODY}
      />

      {message ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm font-semibold ${
            message.tone === "success"
              ? "border-accent-light bg-accent-light text-accent-dark"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {alreadyAccepted ? (
        <button
          type="button"
          onClick={() => router.replace(nextPath?.startsWith("/") ? nextPath : "/dashboard")}
          className="w-full rounded-md bg-accent px-4 py-3 text-base font-bold text-white shadow-soft"
        >
          Continue
        </button>
      ) : (
        <form
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!hasOpenedBothVersions) {
              setMessage({ tone: "error", text: "Open both language cards before continuing." });
              return;
            }
            setIsSubmitting(true);
            setMessage(null);
            const result = await acceptCurrentLegalDocumentAction({
              documentType,
              nextPath
            });
            setIsSubmitting(false);
            setMessage({ tone: result.ok ? "success" : "error", text: result.message });
            if (result.ok) {
              router.replace(result.nextPath);
              router.refresh();
            }
          }}
        >
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
            />
            <span className="text-sm font-semibold leading-6 text-gray-800">
              I have read and agree to the Terms of Use.
            </span>
          </label>

          {!hasOpenedBothVersions ? (
            <p className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
              Open both the English and Spanish cards before accepting.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!checked || !hasOpenedBothVersions || isSubmitting}
            className="w-full rounded-md bg-accent px-4 py-3 text-base font-bold text-white shadow-soft disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isSubmitting ? "Saving..." : "Accept and Continue"}
          </button>
        </form>
      )}
    </section>
  );
}

function LegalDisclosureCard({
  title,
  subtitle,
  open,
  onToggle,
  body
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  body: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-gray-50"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block text-base font-black text-gray-950">{title}</span>
          <span className="mt-1 block text-sm font-semibold text-gray-500">{subtitle}</span>
        </span>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600">
          {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        </span>
      </button>

      {open ? (
        <div className="border-t border-gray-200 px-5 py-5">
          <div className="space-y-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-gray-700">{body}</div>
        </div>
      ) : null}
    </section>
  );
}
