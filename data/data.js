// URBN Platform - Global Market Data
// Demo data for all markets

const URBN_DATA = {

  markets: [
    // EGYPT
    { id: 'cairo', name: 'Cairo', country: 'Egypt', countryCode: 'EG', region: 'MENA', currency: 'EGP', active: true,
      submarkets: ['New Cairo', 'CBD', '6th of October', 'Heliopolis', 'Maadi'] },
    // UAE
    { id: 'dubai', name: 'Dubai', country: 'UAE', countryCode: 'AE', region: 'GCC', currency: 'AED', active: true,
      submarkets: ['DIFC', 'Business Bay', 'Downtown', 'TECOM', 'JLT', 'Dubai Hills'] },
    // SAUDI ARABIA
    { id: 'riyadh', name: 'Riyadh', country: 'Saudi Arabia', countryCode: 'SA', region: 'GCC', currency: 'SAR', active: true,
      submarkets: ['King Fahad District', 'Olaya', 'KAFD', 'Al Malqa'] },
    // MOROCCO
    { id: 'casablanca', name: 'Casablanca', country: 'Morocco', countryCode: 'MA', region: 'North Africa', currency: 'MAD', active: true,
      submarkets: ['Casa Finance City', 'Maarif', 'Ain Diab', 'Sidi Maarouf'] },
    { id: 'rabat', name: 'Rabat', country: 'Morocco', countryCode: 'MA', region: 'North Africa', currency: 'MAD', active: true,
      submarkets: ['Agdal', 'Hassan', 'Hay Riad'] },
    // JORDAN
    { id: 'amman', name: 'Amman', country: 'Jordan', countryCode: 'JO', region: 'Levant', currency: 'JOD', active: true,
      submarkets: ['Abdali', 'Shmeisani', 'Sweifieh', 'Al Baraka'] },
    // TUNISIA
    { id: 'tunis', name: 'Tunis', country: 'Tunisia', countryCode: 'TN', region: 'North Africa', currency: 'TND', active: true,
      submarkets: ['Les Berges du Lac', 'City Centre', 'La Marsa'] },
    // ALGERIA
    { id: 'algiers', name: 'Algiers', country: 'Algeria', countryCode: 'DZ', region: 'North Africa', currency: 'DZD', active: true,
      submarkets: ['Hydra', 'El Biar', 'Cheraga'] },
    // ETHIOPIA
    { id: 'addis', name: 'Addis Ababa', country: 'Ethiopia', countryCode: 'ET', region: 'East Africa', currency: 'ETB', active: true,
      submarkets: ['Bole', 'Kazanchis', 'CMC', 'Megenagna'] },
    // KENYA
    { id: 'nairobi', name: 'Nairobi', country: 'Kenya', countryCode: 'KE', region: 'East Africa', currency: 'KES', active: true,
      submarkets: ['Westlands', 'Upper Hill', 'CBD', 'Karen'] },
    // GHANA
    { id: 'accra', name: 'Accra', country: 'Ghana', countryCode: 'GH', region: 'West Africa', currency: 'GHS', active: true,
      submarkets: ['Airport City', 'Cantonments', 'Osu', 'Ridge'] },
    // NIGERIA
    { id: 'lagos', name: 'Lagos', country: 'Nigeria', countryCode: 'NG', region: 'West Africa', currency: 'NGN', active: true,
      submarkets: ['Victoria Island', 'Ikoyi', 'Lekki', 'Marina'] },
    { id: 'abuja', name: 'Abuja', country: 'Nigeria', countryCode: 'NG', region: 'West Africa', currency: 'NGN', active: true,
      submarkets: ['Maitama', 'Garki', 'Wuse 2', 'Central Business District'] },
    // SOUTH AFRICA
    { id: 'johannesburg', name: 'Johannesburg', country: 'South Africa', countryCode: 'ZA', region: 'Southern Africa', currency: 'ZAR', active: true,
      submarkets: ['Sandton', 'Rosebank', 'Midrand', 'Waterfall'] },
    { id: 'capetown', name: 'Cape Town', country: 'South Africa', countryCode: 'ZA', region: 'Southern Africa', currency: 'ZAR', active: true,
      submarkets: ['Century City', 'CBD', 'Claremont', 'Waterfront'] },
    // ANGOLA
    { id: 'luanda', name: 'Luanda', country: 'Angola', countryCode: 'AO', region: 'Southern Africa', currency: 'AOA', active: true,
      submarkets: ['Miramar', 'Ingombota', 'Maianga', 'Talatona'] },
  ],

  buildings: [
    // CAIRO - NEW CAIRO
    { id: 'b001', name: 'Nile Business City', anonName: 'Grade A+ Tower · New Cairo', market: 'cairo', submarket: 'New Cairo',
      grade: 'A+', gla: 45000, floorplate: 2200, floors: 22, parking: 1.8, yearBuilt: 2021,
      rentMin: 950, rentMax: 1400, rentCurrency: 'EGP', rentUnit: 'sqm/month',
      availMin: 500, availMax: 3500, sustainability: ['LEED Gold', 'Smart Building'],
      amenities: ['Concierge', 'Gym', 'F&B', 'Conference Centre', 'Generator', 'BMS'],
      lat: 30.0222, lng: 31.4967, visible: true,
      units: [
        { id: 'u001a', floor: 8, size: 850, desks: 85, meetingRooms: 4, rent: 1200, status: 'available', type: 'full-floor' },
        { id: 'u001b', floor: 12, size: 1100, desks: 110, meetingRooms: 5, rent: 1280, status: 'available', type: 'full-floor' },
        { id: 'u001c', floor: 15, size: 550, desks: 55, meetingRooms: 3, rent: 1350, status: 'available', type: 'partial-floor' },
      ]
    },
    { id: 'b002', name: 'Cairo Business Plaza', anonName: 'Grade A Tower · New Cairo', market: 'cairo', submarket: 'New Cairo',
      grade: 'A', gla: 28000, floorplate: 1600, floors: 18, parking: 1.5, yearBuilt: 2019,
      rentMin: 750, rentMax: 1100, rentCurrency: 'EGP', rentUnit: 'sqm/month',
      availMin: 300, availMax: 2200, sustainability: ['Energy Star'],
      amenities: ['Reception', 'Parking', 'Generator', 'Pantry Areas'],
      lat: 30.0150, lng: 31.4900,
      units: [
        { id: 'u002a', floor: 5, size: 720, desks: 72, meetingRooms: 3, rent: 900, status: 'available', type: 'full-floor' },
        { id: 'u002b', floor: 9, size: 420, desks: 42, meetingRooms: 2, rent: 950, status: 'available', type: 'partial-floor' },
      ]
    },
    // CAIRO - CBD
    { id: 'b003', name: 'Nile City Towers North', anonName: 'Grade A+ Complex · CBD', market: 'cairo', submarket: 'CBD',
      grade: 'A+', gla: 62000, floorplate: 3100, floors: 30, parking: 2.0, yearBuilt: 2005,
      rentMin: 1100, rentMax: 1600, rentCurrency: 'EGP', rentUnit: 'sqm/month',
      availMin: 800, availMax: 5000, sustainability: ['BREEAM Very Good'],
      amenities: ['5-Star Hotel', 'F&B', 'Conference', 'Gym', 'Concierge', 'Riverside Views'],
      lat: 30.0626, lng: 31.2218,
      units: [
        { id: 'u003a', floor: 18, size: 1500, desks: 150, meetingRooms: 8, rent: 1500, status: 'available', type: 'full-floor' },
        { id: 'u003b', floor: 22, size: 800, desks: 80, meetingRooms: 4, rent: 1580, status: 'available', type: 'partial-floor' },
      ]
    },
    // CAIRO - 6TH OF OCTOBER
    { id: 'b004', name: 'Smart Village Hub', anonName: 'Grade A Campus · 6th of October', market: 'cairo', submarket: '6th of October',
      grade: 'A', gla: 35000, floorplate: 1800, floors: 12, parking: 2.5, yearBuilt: 2018,
      rentMin: 600, rentMax: 900, rentCurrency: 'EGP', rentUnit: 'sqm/month',
      availMin: 400, availMax: 3000, sustainability: ['Solar Panels', 'Green Spaces'],
      amenities: ['Campus Setting', 'Café', 'Parking', 'Security', 'Generator'],
      lat: 30.0074, lng: 31.0125,
      units: [
        { id: 'u004a', floor: 3, size: 900, desks: 90, meetingRooms: 4, rent: 750, status: 'available', type: 'full-floor' },
      ]
    },

    // DUBAI - DIFC
    { id: 'b005', name: 'Gate Village 8', anonName: 'Grade A+ Tower · DIFC', market: 'dubai', submarket: 'DIFC',
      grade: 'A+', gla: 38000, floorplate: 1900, floors: 20, parking: 1.2, yearBuilt: 2017,
      rentMin: 2200, rentMax: 3500, rentCurrency: 'AED', rentUnit: 'sqm/year',
      availMin: 200, availMax: 2500, sustainability: ['LEED Platinum', 'WELL Certified'],
      amenities: ['DIFC Address', 'Art Gallery', 'F&B', 'Concierge', 'Premium Lobby'],
      lat: 25.2118, lng: 55.2797,
      units: [
        { id: 'u005a', floor: 10, size: 650, desks: 65, meetingRooms: 4, rent: 3200, status: 'available', type: 'partial-floor' },
        { id: 'u005b', floor: 14, size: 1200, desks: 120, meetingRooms: 6, rent: 3400, status: 'available', type: 'full-floor' },
      ]
    },
    // DUBAI - BUSINESS BAY
    { id: 'b006', name: 'Bay Square Tower 7', anonName: 'Grade A Tower · Business Bay', market: 'dubai', submarket: 'Business Bay',
      grade: 'A', gla: 29000, floorplate: 1450, floors: 22, parking: 1.0, yearBuilt: 2016,
      rentMin: 1600, rentMax: 2400, rentCurrency: 'AED', rentUnit: 'sqm/year',
      availMin: 150, availMax: 2000, sustainability: ['LEED Gold'],
      amenities: ['Canal Views', 'Gym', 'Café', 'Metro Access'],
      lat: 25.1894, lng: 55.2628,
      units: [
        { id: 'u006a', floor: 7, size: 480, desks: 48, meetingRooms: 2, rent: 2100, status: 'available', type: 'partial-floor' },
        { id: 'u006b', floor: 11, size: 1100, desks: 110, meetingRooms: 5, rent: 2250, status: 'available', type: 'full-floor' },
      ]
    },
    // DUBAI - DOWNTOWN
    { id: 'b007', name: 'Boulevard Plaza 2', anonName: 'Grade A+ Tower · Downtown', market: 'dubai', submarket: 'Downtown',
      grade: 'A+', gla: 52000, floorplate: 2600, floors: 34, parking: 1.5, yearBuilt: 2013,
      rentMin: 2800, rentMax: 4200, rentCurrency: 'AED', rentUnit: 'sqm/year',
      availMin: 300, availMax: 3500, sustainability: ['LEED Gold', 'Smart Building'],
      amenities: ['Burj Khalifa Views', 'Premium Lobby', 'F&B', 'Concierge', 'Valet'],
      lat: 25.1972, lng: 55.2744,
      units: [
        { id: 'u007a', floor: 20, size: 900, desks: 90, meetingRooms: 5, rent: 3800, status: 'available', type: 'partial-floor' },
        { id: 'u007b', floor: 28, size: 1800, desks: 180, meetingRooms: 9, rent: 4100, status: 'available', type: 'full-floor' },
      ]
    },

    // RIYADH - KAFD
    { id: 'b008', name: 'KAFD Tower 3', anonName: 'Grade A+ Tower · KAFD', market: 'riyadh', submarket: 'KAFD',
      grade: 'A+', gla: 58000, floorplate: 2900, floors: 28, parking: 2.0, yearBuilt: 2022,
      rentMin: 1800, rentMax: 2800, rentCurrency: 'SAR', rentUnit: 'sqm/year',
      availMin: 500, availMax: 4000, sustainability: ['LEED Platinum', 'WELL Gold'],
      amenities: ['Metro Access', 'Conference Centre', 'Gym', 'F&B', 'Smart Systems'],
      lat: 24.7671, lng: 46.6521,
      units: [
        { id: 'u008a', floor: 12, size: 1400, desks: 140, meetingRooms: 7, rent: 2500, status: 'available', type: 'full-floor' },
        { id: 'u008b', floor: 18, size: 700, desks: 70, meetingRooms: 4, rent: 2700, status: 'available', type: 'partial-floor' },
      ]
    },

    // CASABLANCA
    { id: 'b009', name: 'Casa Finance City Tower A', anonName: 'Grade A+ Tower · Casa Finance City', market: 'casablanca', submarket: 'Casa Finance City',
      grade: 'A+', gla: 42000, floorplate: 2100, floors: 24, parking: 1.6, yearBuilt: 2020,
      rentMin: 1800, rentMax: 2800, rentCurrency: 'MAD', rentUnit: 'sqm/year',
      availMin: 300, availMax: 3000, sustainability: ['HQE', 'LEED Gold'],
      amenities: ['Financial Hub', 'Conference', 'F&B', 'Concierge'],
      lat: 33.5612, lng: -7.6307,
      units: [
        { id: 'u009a', floor: 10, size: 800, desks: 80, meetingRooms: 4, rent: 2400, status: 'available', type: 'partial-floor' },
      ]
    },

    // NAIROBI
    { id: 'b010', name: 'The Promenade Westlands', anonName: 'Grade A Tower · Westlands', market: 'nairobi', submarket: 'Westlands',
      grade: 'A', gla: 22000, floorplate: 1200, floors: 14, parking: 1.8, yearBuilt: 2019,
      rentMin: 1200, rentMax: 1800, rentCurrency: 'KES', rentUnit: 'sqm/month',
      availMin: 200, availMax: 1800, sustainability: ['Green Star'],
      amenities: ['Gym', 'Café', 'Generator', 'Security', 'Parking'],
      lat: -1.2631, lng: 36.8030,
      units: [
        { id: 'u010a', floor: 6, size: 550, desks: 55, meetingRooms: 3, rent: 1600, status: 'available', type: 'full-floor' },
      ]
    },

    // LAGOS
    { id: 'b011', name: 'Civic Tower Victoria Island', anonName: 'Grade A+ Tower · Victoria Island', market: 'lagos', submarket: 'Victoria Island',
      grade: 'A+', gla: 31000, floorplate: 1550, floors: 20, parking: 1.3, yearBuilt: 2018,
      rentMin: 45000, rentMax: 75000, rentCurrency: 'NGN', rentUnit: 'sqm/year',
      availMin: 300, availMax: 2500, sustainability: ['LEED Gold'],
      amenities: ['Generator', 'Borehole', 'Conference', 'Gym', 'Security'],
      lat: 6.4306, lng: 3.4286,
      units: [
        { id: 'u011a', floor: 8, size: 700, desks: 70, meetingRooms: 3, rent: 65000, status: 'available', type: 'full-floor' },
        { id: 'u011b', floor: 12, size: 420, desks: 42, meetingRooms: 2, rent: 70000, status: 'available', type: 'partial-floor' },
      ]
    },

    // JOHANNESBURG
    { id: 'b012', name: 'Sandton City Office Tower', anonName: 'Grade A+ Tower · Sandton', market: 'johannesburg', submarket: 'Sandton',
      grade: 'A+', gla: 45000, floorplate: 2250, floors: 26, parking: 3.0, yearBuilt: 2016,
      rentMin: 220, rentMax: 380, rentCurrency: 'ZAR', rentUnit: 'sqm/month',
      availMin: 400, availMax: 3500, sustainability: ['Green Star 5-Star', 'LEED Gold'],
      amenities: ['Gautrain Access', 'Mall Link', 'Conference', 'Gym', 'Restaurants'],
      lat: -26.1074, lng: 28.0568,
      units: [
        { id: 'u012a', floor: 14, size: 1100, desks: 110, meetingRooms: 6, rent: 340, status: 'available', type: 'full-floor' },
        { id: 'u012b', floor: 18, size: 600, desks: 60, meetingRooms: 3, rent: 365, status: 'available', type: 'partial-floor' },
      ]
    },

    // ACCRA
    { id: 'b013', name: 'Airport City One', anonName: 'Grade A Tower · Airport City', market: 'accra', submarket: 'Airport City',
      grade: 'A', gla: 18000, floorplate: 950, floors: 12, parking: 2.0, yearBuilt: 2017,
      rentMin: 28, rentMax: 45, rentCurrency: 'USD', rentUnit: 'sqm/month',
      availMin: 150, availMax: 1500, sustainability: ['Energy Star'],
      amenities: ['Generator', 'Security', 'Parking', 'Café'],
      lat: 5.6037, lng: -0.1870,
      units: [
        { id: 'u013a', floor: 5, size: 450, desks: 45, meetingRooms: 2, rent: 38, status: 'available', type: 'full-floor' },
      ]
    },

    // ADDIS ABABA
    { id: 'b014', name: 'Bole Business Centre', anonName: 'Grade A Tower · Bole', market: 'addis', submarket: 'Bole',
      grade: 'A', gla: 15000, floorplate: 800, floors: 10, parking: 1.5, yearBuilt: 2020,
      rentMin: 18, rentMax: 32, rentCurrency: 'USD', rentUnit: 'sqm/month',
      availMin: 100, availMax: 1200, sustainability: [],
      amenities: ['Generator', 'Security', 'Parking', 'Reception'],
      lat: 9.0222, lng: 38.7469,
      units: [
        { id: 'u014a', floor: 4, size: 380, desks: 38, meetingRooms: 2, rent: 28, status: 'available', type: 'full-floor' },
      ]
    },

    // AMMAN
    { id: 'b015', name: 'Abdali Boulevard Tower', anonName: 'Grade A Tower · Abdali', market: 'amman', submarket: 'Abdali',
      grade: 'A', gla: 25000, floorplate: 1300, floors: 16, parking: 1.8, yearBuilt: 2018,
      rentMin: 14, rentMax: 22, rentCurrency: 'JOD', rentUnit: 'sqm/month',
      availMin: 200, availMax: 2000, sustainability: ['LEED Silver'],
      amenities: ['Conference', 'Café', 'Parking', 'Security', 'Generator'],
      lat: 31.9639, lng: 35.9106,
      units: [
        { id: 'u015a', floor: 7, size: 600, desks: 60, meetingRooms: 3, rent: 19, status: 'available', type: 'full-floor' },
      ]
    },

    // LUANDA
    { id: 'b016', name: 'Talatona Business Park', anonName: 'Grade A Complex · Talatona', market: 'luanda', submarket: 'Talatona',
      grade: 'A', gla: 20000, floorplate: 1000, floors: 8, parking: 2.2, yearBuilt: 2016,
      rentMin: 35, rentMax: 55, rentCurrency: 'USD', rentUnit: 'sqm/month',
      availMin: 200, availMax: 1800, sustainability: [],
      amenities: ['Generator', 'Water Storage', 'Security', 'Parking'],
      lat: -8.9035, lng: 13.1644,
      units: [
        { id: 'u016a', floor: 3, size: 500, desks: 50, meetingRooms: 3, rent: 48, status: 'available', type: 'full-floor' },
      ]
    },

    // TUNIS
    { id: 'b017', name: 'Les Berges du Lac Tower', anonName: 'Grade A Tower · Les Berges du Lac', market: 'tunis', submarket: 'Les Berges du Lac',
      grade: 'A', gla: 19000, floorplate: 1000, floors: 12, parking: 1.6, yearBuilt: 2017,
      rentMin: 35, rentMax: 55, rentCurrency: 'TND', rentUnit: 'sqm/month',
      availMin: 150, availMax: 1500, sustainability: [],
      amenities: ['Lake Views', 'Café', 'Parking', 'Security'],
      lat: 36.8379, lng: 10.2306,
      units: [
        { id: 'u017a', floor: 5, size: 480, desks: 48, meetingRooms: 2, rent: 48, status: 'available', type: 'full-floor' },
      ]
    },

    // CAPE TOWN
    { id: 'b018', name: 'Century City Square', anonName: 'Grade A+ Tower · Century City', market: 'capetown', submarket: 'Century City',
      grade: 'A+', gla: 32000, floorplate: 1600, floors: 18, parking: 3.5, yearBuilt: 2019,
      rentMin: 200, rentMax: 320, rentCurrency: 'ZAR', rentUnit: 'sqm/month',
      availMin: 300, availMax: 3000, sustainability: ['Green Star 5-Star'],
      amenities: ['Canal Views', 'Gym', 'Conference', 'F&B', 'Retail'],
      lat: -33.8928, lng: 18.5120,
      units: [
        { id: 'u018a', floor: 10, size: 900, desks: 90, meetingRooms: 5, rent: 295, status: 'available', type: 'full-floor' },
      ]
    },
  ],

  // Market stats for Bloomberg dashboard
  marketStats: {
    cairo: { vacancyRate: 14.2, avgRent: 1100, totalStock: 1850000, newSupply: 125000, absorption: 95000, trend: 'up' },
    dubai: { vacancyRate: 11.8, avgRent: 2600, totalStock: 9200000, newSupply: 280000, absorption: 310000, trend: 'up' },
    riyadh: { vacancyRate: 8.5, avgRent: 2200, totalStock: 4100000, newSupply: 420000, absorption: 380000, trend: 'up' },
    casablanca: { vacancyRate: 16.4, avgRent: 2200, totalStock: 980000, newSupply: 45000, absorption: 38000, trend: 'stable' },
    nairobi: { vacancyRate: 18.7, avgRent: 1500, totalStock: 720000, newSupply: 62000, absorption: 41000, trend: 'down' },
    lagos: { vacancyRate: 22.1, avgRent: 58000, totalStock: 580000, newSupply: 35000, absorption: 28000, trend: 'stable' },
    johannesburg: { vacancyRate: 13.9, avgRent: 310, totalStock: 5200000, newSupply: 95000, absorption: 88000, trend: 'stable' },
  },

  // Managers directory
  managers: [
    { id: 'm001', name: 'Ahmed El Sayed', company: 'CBRE Egypt', role: 'Head of Office Leasing', markets: ['cairo'], portfolioType: 'Office', verified: true, areas: ['New Cairo', 'CBD', '6th of October'] },
    { id: 'm002', name: 'Sarah Mitchell', company: 'JLL Dubai', role: 'Senior Director', markets: ['dubai'], portfolioType: 'Office', verified: true, areas: ['DIFC', 'Business Bay', 'Downtown'] },
    { id: 'm003', name: 'Khalid Al Rashidi', company: 'Knight Frank KSA', role: 'Associate Director', markets: ['riyadh'], portfolioType: 'Office', verified: true, areas: ['KAFD', 'King Fahad District'] },
    { id: 'm004', name: 'Youssef Benali', company: 'Savills Maroc', role: 'Head of Commercial', markets: ['casablanca', 'rabat'], portfolioType: 'Office', verified: true, areas: ['Casa Finance City', 'Maarif'] },
    { id: 'm005', name: 'Amara Osei', company: 'Broll Ghana', role: 'Leasing Manager', markets: ['accra'], portfolioType: 'Office', verified: false, areas: ['Airport City', 'Cantonments'] },
    { id: 'm006', name: 'Tendai Moyo', company: 'JLL South Africa', role: 'Associate Director', markets: ['johannesburg', 'capetown'], portfolioType: 'Office', verified: true, areas: ['Sandton', 'Rosebank', 'Century City'] },
    { id: 'm007', name: 'Emeka Okonkwo', company: 'CBRE Nigeria', role: 'Head of Corporate Solutions', markets: ['lagos', 'abuja'], portfolioType: 'Office', verified: true, areas: ['Victoria Island', 'Ikoyi', 'Maitama'] },
    { id: 'm008', name: 'James Mwangi', company: 'Knight Frank Kenya', role: 'Senior Manager', markets: ['nairobi'], portfolioType: 'Office', verified: true, areas: ['Westlands', 'Upper Hill'] },
  ],

  // Industrial listings
  industrial: [
    { id: 'i001', name: 'Cairo Logistics Hub', anonName: 'Grade A Warehouse · 6th of October', market: 'cairo', submarket: '6th of October',
      type: 'warehouse', size: 12000, clearHeight: 12, dockDoors: 8, power: 2000, floorLoading: 50,
      rent: 85, rentCurrency: 'EGP', hasColdStorage: false, compliance: [], status: 'available' },
    { id: 'i002', name: 'Dubai Industrial City Unit 14', anonName: 'Grade A DC · DIC', market: 'dubai', submarket: 'DIC',
      type: 'distribution-center', size: 25000, clearHeight: 14, dockDoors: 16, power: 5000, floorLoading: 60,
      rent: 380, rentCurrency: 'AED', hasColdStorage: true, compliance: ['food-grade'], status: 'available' },
    { id: 'i003', name: 'Nairobi Industrial Park Unit 7', anonName: 'Warehouse · Industrial Area', market: 'nairobi', submarket: 'Industrial Area',
      type: 'warehouse', size: 5000, clearHeight: 8, dockDoors: 3, power: 800, floorLoading: 40,
      rent: 650, rentCurrency: 'KES', hasColdStorage: false, compliance: [], status: 'available' },
  ],

  // Subscription plans
  plans: [
    { id: 'trial', name: 'Trial', price: 0, credits: 3, features: ['3 property reveals', '24h access', 'Basic search'] },
    { id: 'starter', name: 'Starter', price: 499, priceCurrency: 'USD', billingCycle: 'month', credits: 10,
      features: ['10 credits/month', 'All markets', 'Basic filters', 'Email alerts'] },
    { id: 'professional', name: 'Professional', price: 1299, priceCurrency: 'USD', billingCycle: 'month', credits: 30,
      features: ['30 credits/month', 'All markets', 'Advanced filters', 'Market analytics', 'Stay vs Go tool', 'Priority support'] },
    { id: 'enterprise', name: 'Enterprise', price: null, priceCurrency: 'USD', billingCycle: 'month', credits: 999,
      features: ['Unlimited credits', 'All markets', 'Full analytics', 'API access', 'Custom reports', 'Dedicated manager'] },
  ],

};

// Export for use across pages
if (typeof module !== 'undefined') module.exports = URBN_DATA;
