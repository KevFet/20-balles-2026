export type Language = 'fr' | 'en' | 'es_mx';

export interface Item {
    id: string;
    name_fr: string;
    name_en: string;
    name_es_mx: string;
    adj_fr: string;
    adj_en: string;
    adj_es_mx: string;
    image_url: string | null;
    base_price: number;
}

export interface Game {
    id: string;
    code: string;
    status: 'LOBBY' | 'ESTIMATION' | 'RESULTS' | 'FINISHED';
    current_item_id: string | null;
    created_at: string;
}

export interface Player {
    id: string;
    game_id: string;
    nickname: string;
    score: number;
    is_host: boolean;
    last_estimation: number | null;
    joined_at: string;
    is_online: boolean;
}
