export interface BarCategory {
  id: string;
  name: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface BarProduct {
  id: string;
  category_id: string | null;
  warehouse_product_id: string | null;
  name: string;
  price: number;
  sort_order: number;
  is_active: boolean;
  image_url?: string | null;
  low_stock_threshold?: number;
  stock?: number | null;
}

export interface BarOrderItem {
  id?: string;
  bar_product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface BarOrder {
  id: string;
  order_number: number;
  operator_id: string;
  payment_method: "contanti" | "carta" | "camera" | "misto" | "omaggio" | null;
  room_number: string | null;
  guest_name: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: "aperto" | "pagato" | "annullato";
  cassa_session_id: string | null;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
  items?: BarOrderItem[];
  operator_name?: string;
  room_folio_settled?: boolean;
  room_checkout_date?: string | null;
  discount_type?: string | null;
  discount_value?: number;
  discount_reason?: string | null;
  is_complimentary?: boolean;
  complimentary_reason?: string | null;
  service_area?: string;
  payment_split?: Record<string, number> | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
}

export interface OccupiedRoom {
  room_id: string;
  room_number: number;
  room_name: string | null;
  guest_name: string;
  check_in: string;
  check_out: string;
}

export interface CartItem {
  product: BarProduct;
  quantity: number;
}
