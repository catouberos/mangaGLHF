import { createClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";

import type { Database } from "@data/database.types";

import type { Publication, Serie } from "@data/public.types";

// Create a single supabase client for interacting with your database
const client = createClient<Database>(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_ANON_KEY || ""
);

// Default the range to current month
const firstDay = DateTime.now().startOf("month").toISODate();
const lastDay = DateTime.now().endOf("month").toISODate();

export async function getEntries(
  start: string = firstDay,
  end: string = lastDay,
  filter?: {
    publishers?: string | string[];
  },
  order: boolean = true
) {
  let query = client
    .from("publication")
    .select(
      `*,
      publisher(id,name)`
    )
    .gte("date", start)
    .lte("date", end)
    .order("date", {
      ascending: order,
    })
    .order("wide", {
      ascending: false,
    })
    .order("name", {
      ascending: true,
    })
    .order("edition", {
      ascending: false,
    });

  if (filter?.publishers) {
    query = query.in("publisher", [filter.publishers]);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data as Publication[];
}

export async function getEntriesByGroup(
  start: string = firstDay,
  end: string = lastDay,
  filter?: {
    publishers?: string | string[];
  },
  order?: boolean
) {
  type groups = {
    [key: string]: Publication[];
  };

  const events = await getEntries(start, end, filter, order);

  const groupedEvents = events.reduce((events, event) => {
    if (!events[event.date]) {
      events[event.date] = [];
    }
    events[event.date].push(event);

    return events;
  }, {} as groups);

  const groupedEventsArray = Object.keys(groupedEvents).map((date) => {
    return {
      date,
      entries: groupedEvents[date],
    };
  });

  return groupedEventsArray;
}

export async function getEntriesById(id: number, count?: number) {
  const response = client
    .from("publication")
    .select()
    .eq("serie_id", id)
    .order("date", {
      ascending: true,
    })
    .order("edition", {
      ascending: false,
    });

  const { data } = count ? await response.limit(count) : await response;

  return data!;
}

export async function getLicensedInfo(id: number) {
  const { data, error } = await client
    .from("licensed")
    .select()
    .eq("serie_id", id)
    .limit(1);

  if (error) {
    throw error;
  }

  return data;
}

export async function getLicensed() {
  const { data, error } = await client
    .from("licensed")
    .select()
    .order("timestamp", {
      ascending: false,
    })
    .order("publisher", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  const parsedData = await Promise.all(
    data.map(async (entry) => {
      return {
        ...entry,
        publisherLabel:
          (await getPublisher(entry.publisher)).name || "đang cập nhật",
      };
    })
  );

  return parsedData;
}

export async function getType(query: string) {
  const { data, error } = await client
    .from("type")
    .select()
    .eq("id", query)
    .limit(1);

  if (error) {
    throw error;
  }

  return data[0];
}

export async function getTypes() {
  const { data, error } = await client.from("type").select();

  if (error) {
    throw error;
  }

  return data;
}

export async function getPublisher(query: string) {
  const { data, error } = await client
    .from("publisher")
    .select()
    .eq("id", query)
    .limit(1);

  if (error) {
    throw error;
  }

  return data[0];
}

export async function getPublishers() {
  const { data, error } = await client.from("publisher").select();

  if (error) {
    throw error;
  }

  return data;
}

export async function getSerie(id: number) {
  const { data, error } = await client
    .from("series")
    .select(
      `
    id,
    name,
    anilist,
    type(*),
    publisher(*),
    publication(id,name,edition,price,image_url,date),
    licensed(source,image_url,timestamp),
    status
    `
    )
    .eq("id", id)
    .order("date", { foreignTable: "publication", ascending: true })
    .order("edition", { foreignTable: "publication", ascending: false })
    .limit(1, { foreignTable: "type" })
    .limit(1, { foreignTable: "publisher" })
    .limit(1)
    .single();

  if (error) {
    throw error;
  }

  return {
    ...data,
    // handle array cases
    type: Array.isArray(data.type) ? data.type[0] : data.type,
    publisher: Array.isArray(data.publisher)
      ? data.publisher[0]
      : data.publisher,
    publication: data.publication
      ? Array.isArray(data.publication)
        ? data.publication
        : [data.publication]
      : null,
    licensed: Array.isArray(data.licensed) ? data.licensed[0] : data.licensed,
  };
}

export async function getSeries(filter?: {
  publishers?: string | string[];
  types?: string | string[];
  status?: Serie | Serie[];
}) {
  let query = client
    .from("series")
    .select(
      `
  *,
  licensed(image_url),
  publication(image_url),
  publisher(id,name),
  type(id,name,color)
  `
    )
    .order("status", { ascending: true })
    .order("publisher", { ascending: true })
    .order("name", { ascending: true });

  if (filter?.publishers) {
    query = query.in("publisher", [filter.publishers]);
  }

  if (filter?.types) {
    query = query.in("type", [filter.types]);
  }

  if (filter?.status) {
    query = query.in("status", [filter.status]);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data.map((data) => ({
    ...data,
    image_url:
      Array.isArray(data.publication) &&
      data.publication.length > 0 &&
      data.publication[0].image_url
        ? data.publication[0].image_url
        : data.licensed
        ? (data.licensed as { image_url: string }).image_url
        : null,
  }));
}

export async function getSeriesId() {
  const { data, error } = await client.from("series").select(`id`);

  if (error) {
    throw error;
  }

  return data;
}
