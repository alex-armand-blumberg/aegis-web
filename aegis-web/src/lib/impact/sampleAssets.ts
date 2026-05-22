import type { UserAsset } from "./types";

export const SAMPLE_ASSETS_CSV = `name,type,country,city,lat,lon,importance,owner,tags,notes
Haifa Supplier,supplier,Israel,Haifa,32.7940,34.9896,high,Demo Team,"electronics;shipping","Fictional demo supplier"
Hsinchu Chip Partner,supplier,Taiwan,Hsinchu,24.8138,120.9675,critical,Demo Team,"semiconductors","Fictional demo supplier"
Port of Piraeus,port,Greece,Piraeus,37.9420,23.6469,medium,Demo Team,"shipping;port","Fictional demo logistics node"
Nairobi Field Office,office,Kenya,Nairobi,-1.2864,36.8172,medium,Demo Team,"office;travel","Fictional demo office"
Red Sea Shipping Exposure,route,Yemen,Red Sea,15.5000,42.0000,high,Demo Team,"shipping;maritime","Fictional route exposure point"
Kyiv Humanitarian Partner,field_site,Ukraine,Kyiv,50.4501,30.5234,high,Demo Team,"humanitarian;field","Fictional demo partner"
Manila Regional Office,office,Philippines,Manila,14.5995,120.9842,medium,Demo Team,"office;regional","Fictional demo office"
Istanbul Logistics Hub,facility,Turkey,Istanbul,41.0082,28.9784,medium,Demo Team,"logistics","Fictional demo facility"
`;

export const SAMPLE_ASSETS: UserAsset[] = [
  {
    id: "sample-haifa-supplier",
    name: "Haifa Supplier",
    type: "supplier",
    country: "Israel",
    city: "Haifa",
    lat: 32.794,
    lon: 34.9896,
    importance: "high",
    owner: "Demo Team",
    tags: ["electronics", "shipping"],
    notes: "Fictional demo supplier",
  },
  {
    id: "sample-hsinchu-chip",
    name: "Hsinchu Chip Partner",
    type: "supplier",
    country: "Taiwan",
    city: "Hsinchu",
    lat: 24.8138,
    lon: 120.9675,
    importance: "critical",
    owner: "Demo Team",
    tags: ["semiconductors"],
    notes: "Fictional demo supplier",
  },
  {
    id: "sample-piraeus-port",
    name: "Port of Piraeus",
    type: "port",
    country: "Greece",
    city: "Piraeus",
    lat: 37.942,
    lon: 23.6469,
    importance: "medium",
    owner: "Demo Team",
    tags: ["shipping", "port"],
    notes: "Fictional demo logistics node",
  },
  {
    id: "sample-nairobi-office",
    name: "Nairobi Field Office",
    type: "office",
    country: "Kenya",
    city: "Nairobi",
    lat: -1.2864,
    lon: 36.8172,
    importance: "medium",
    owner: "Demo Team",
    tags: ["office", "travel"],
    notes: "Fictional demo office",
  },
  {
    id: "sample-red-sea-route",
    name: "Red Sea Shipping Exposure",
    type: "route",
    country: "Yemen",
    city: "Red Sea",
    lat: 15.5,
    lon: 42.0,
    importance: "high",
    owner: "Demo Team",
    tags: ["shipping", "maritime"],
    notes: "Fictional route exposure point",
  },
  {
    id: "sample-kyiv-field",
    name: "Kyiv Humanitarian Partner",
    type: "field_site",
    country: "Ukraine",
    city: "Kyiv",
    lat: 50.4501,
    lon: 30.5234,
    importance: "high",
    owner: "Demo Team",
    tags: ["humanitarian", "field"],
    notes: "Fictional demo partner",
  },
  {
    id: "sample-manila-office",
    name: "Manila Regional Office",
    type: "office",
    country: "Philippines",
    city: "Manila",
    lat: 14.5995,
    lon: 120.9842,
    importance: "medium",
    owner: "Demo Team",
    tags: ["office", "regional"],
    notes: "Fictional demo office",
  },
  {
    id: "sample-istanbul-facility",
    name: "Istanbul Logistics Hub",
    type: "facility",
    country: "Turkey",
    city: "Istanbul",
    lat: 41.0082,
    lon: 28.9784,
    importance: "medium",
    owner: "Demo Team",
    tags: ["logistics"],
    notes: "Fictional demo facility",
  },
];
