export type NotificationCategory =
  | "quotes_accepted"
  | "quotes_received"
  | "voice_intakes"
  | "invoices_received";

export type NotificationBadgeKey =
  | "messages"
  | "quotes_accepted"
  | "quotes_received"
  | "voice_intakes"
  | "invoices_received";

export type NotificationCounts = {
  ok: true;
  messages: number;
  quotes_accepted: number;
  quotes_received: number;
  voice_intakes: number;
  invoices_received: number;
  is_artisan: boolean;
};

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};
