// Simple mock transport service. In a real app you would call flight/train/bus APIs.

export interface RouteInfo {
  mode: 'plane' | 'train' | 'bus' | 'car';
  description: string;
  durationHours: number;
  costUsd: number;
  transfers: number;
  visaRequired: boolean;
}

const mockRoutes: RouteInfo[] = [
  {
    mode: 'plane',
    description: 'Direct flight (Ryanair)',
    durationHours: 2,
    costUsd: 120,
    transfers: 0,
    visaRequired: false,
  },
  {
    mode: 'train',
    description: 'EuroCity train with transfer in Frankfurt',
    durationHours: 5.5,
    costUsd: 85,
    transfers: 1,
    visaRequired: false,
  },
  {
    mode: 'bus',
    description: 'FlixBus overnight route',
    durationHours: 6,
    costUsd: 40,
    transfers: 0,
    visaRequired: false,
  },
  {
    mode: 'car',
    description: 'Rental car through scenic villages',
    durationHours: 4.5,
    costUsd: 150,
    transfers: 0,
    visaRequired: false,
  },
];

export async function fetchRoutes(origin: string, destination: string): Promise<RouteInfo[]> {
  await new Promise((r) => setTimeout(r, 500));
  return mockRoutes;
}
