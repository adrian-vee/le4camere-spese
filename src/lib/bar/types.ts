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
  payment_method: "contanti" | "carta" | "camera" | null;
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
