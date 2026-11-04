// Migrado para Hono de src/routes/api/v1/consultorias/ics/+server.ts — corpo IDÊNTICO ao original
// (só nome/assinatura do handler e caminhos de import mudaram). Ver src/lib/server/api/app.ts.
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { NO_STORE_HEADERS } from '$lib/server/httpCache';
import { isUuid, logServerError, requireAuthenticatedUser } from '$lib/server/v1';
import { todayISODateLocal } from '$lib/date';

type ConsultoriaIcsRow = {
  id?: string | null;
  cliente_nome?: string | null;
  data_hora?: string | null;
  destino?: string | null;
};

function toIcsDate(value: Date) {
  const iso = value.toISOString().replace(/[-:]/g, "").split(".")[0];
  return `${iso}Z`;
}

function escapeIcsText(value: string) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export const handleConsultoriasIcsGet = async (event: RequestEvent) => {
  try {
    const { url, locals } = event;
    await requireAuthenticatedUser(event);

    const id = url.searchParams.get("id") || "";
    if (id && !isUuid(id)) {
      return json({ error: "ID invalido." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const client = locals.dados;

    const baseQuery = client
      .from("consultorias_online")
      .select("id, cliente_nome, data_hora, destino")
      .order("data_hora", { ascending: true });

    const { data: rows, error } = id
      ? await baseQuery.eq("id", id).limit(1)
      : await baseQuery.limit(500);

    if (error) {
      return json({ error: "Erro ao carregar consultorias." }, { status: 500, headers: NO_STORE_HEADERS });
    }

    const items = ((rows || []) as ConsultoriaIcsRow[]).filter((row) => {
      const start = new Date(row?.data_hora || "");
      return !Number.isNaN(start.getTime());
    });

    if (items.length === 0) {
      return json({ error: "Nenhuma consultoria valida para exportar." }, { status: 404, headers: NO_STORE_HEADERS });
    }

    const events = items
      .map((item) => {
        const start = new Date(item.data_hora || "");
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        const summary = escapeIcsText(`Consultoria - ${item.cliente_nome || "Cliente"}`);
        const description = escapeIcsText(item.destino ? `Destino: ${item.destino}` : "Consultoria");

        return [
          "BEGIN:VEVENT",
          `UID:consultoria-${item.id}@vtur.app`,
          `DTSTAMP:${toIcsDate(new Date())}`,
          `DTSTART:${toIcsDate(start)}`,
          `DTEND:${toIcsDate(end)}`,
          `SUMMARY:${summary}`,
          `DESCRIPTION:${description}`,
          "LOCATION:Consultoria",
          "END:VEVENT"
        ].join("\r\n");
      })
      .join("\r\n");

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//vtur//Consultoria//PT-BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      events,
      "END:VCALENDAR",
    ].join("\r\n");

    const fileName = id && items[0]?.id
      ? `consultoria-${items[0].id}.ics`
      : `consultorias-${todayISODateLocal()}.ics`;

    return new Response(ics, {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: unknown) {
    logServerError("[consultorias/ics] falha ao exportar ICS", error);
    return json({ error: "Erro interno ao exportar consultorias." }, { status: 500, headers: NO_STORE_HEADERS });
  }
};
