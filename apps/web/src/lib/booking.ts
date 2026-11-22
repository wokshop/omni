import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import type { Api } from "@omni/client";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api, call } from "./api.ts";
import { calendarKeys } from "./calendar.ts";

type Links = Api["calendar"]["booking-links"];
type Json<T> = T extends { json: infer J } ? J : never;

export type BookingLink = InferResponseType<Links["$get"], 200>["links"][number];
export type NewBookingLink = Json<InferRequestType<Links["$post"]>>;
export type BookingPage = InferResponseType<Api["booking"][":slug"]["$get"], 200>;
export type Booking = Json<InferRequestType<Api["booking"][":slug"]["$post"]>>;

export const bookingKeys = {
  links: () => [...calendarKeys.all(), "booking-links"] as const,
  page: (slug: string) => ["booking", slug] as const,
};

/** What a visitor opens: `/book/<slug>`. */
export const bookingUrl = (slug: string) => `${window.location.origin}/book/${slug}`;

export const bookingLinksQuery = () =>
  queryOptions({
    queryKey: bookingKeys.links(),
    queryFn: ({ signal }) => call(api.calendar["booking-links"].$get({}, { init: { signal } })),
    select: (body) => body.links,
  });

export const createBookingLinkMutation = (client: QueryClient) =>
  mutationOptions({
    mutationFn: (json: NewBookingLink) => call(api.calendar["booking-links"].$post({ json })),
    onSettled: () => client.invalidateQueries({ queryKey: bookingKeys.links() }),
  });

export const deleteBookingLinkMutation = (client: QueryClient) =>
  mutationOptions({
    mutationFn: (id: string) =>
      call(api.calendar["booking-links"][":id"].$delete({ param: { id } })),
    onSettled: () => client.invalidateQueries({ queryKey: bookingKeys.links() }),
  });

export const bookingPageQuery = (slug: string) =>
  queryOptions({
    queryKey: bookingKeys.page(slug),
    queryFn: ({ signal }) =>
      call(api.booking[":slug"].$get({ param: { slug } }, { init: { signal } })),
    staleTime: 30_000,
  });

export const bookMutation = (client: QueryClient, slug: string) =>
  mutationOptions({
    mutationFn: (json: Booking) => call(api.booking[":slug"].$post({ param: { slug }, json })),
    onSettled: () => client.invalidateQueries({ queryKey: bookingKeys.page(slug) }),
  });
