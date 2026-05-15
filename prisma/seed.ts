import {
  PrismaClient,
  PropertyType,
  IndexationType,
  LeaseStatus,
  AmortizationType,
  DistributionPeriodicity,
  PipelineStatus,
} from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Очищаем данные в правильном порядке (зависимые таблицы первыми)
  await prisma.capexItem.deleteMany()
  await prisma.leaseContract.deleteMany()
  await prisma.fundDebt.deleteMany()
  await prisma.fundProperty.deleteMany()
  await prisma.property.deleteMany()
  await prisma.fund.deleteMany()

  // ─── Фонд 1: Офисно-торговый ───────────────────────────────────────────────
  // totalUnits = totalEmission / nominalUnitPrice = 5 000 000 000 / 50 000 = 100 000
  const fund1 = await prisma.fund.create({
    data: {
      name: 'ЗПИФ Недвижимость Москва',
      registrationNumber: '0123-75409054',
      startDate: new Date('2020-01-01'),
      endDate: new Date('2030-12-31'),
      totalEmission: 5_000_000_000,     // 5 млрд ₽
      nominalUnitPrice: 50_000,          // 50 тыс ₽/пай
      totalUnits: 100_000,               // расчётное: 5 млрд / 50 тыс
      managementFeeRate: 0.015,          // 1.5% от СЧА/год
      fundExpensesRate: 0.003,           // 0.3% от СЧА/год (спец.деп + рег + оценщик)
      upfrontFeeRate: 0.02,              // 2% Upfront fee
      successFeeOperational: 0.20,       // 20% от выплат пайщикам
      successFeeExit: 0.20,              // 20% от прироста СЧА
      distributionPeriodicity: DistributionPeriodicity.QUARTERLY,
      hasDebt: true,
    },
  })

  // ─── Фонд 2: Складской ─────────────────────────────────────────────────────
  // totalUnits = 2 000 000 000 / 40 000 = 50 000
  const fund2 = await prisma.fund.create({
    data: {
      name: 'ЗПИФ Складская Недвижимость',
      registrationNumber: '0456-98217311',
      startDate: new Date('2022-01-01'),
      endDate: new Date('2032-12-31'),
      totalEmission: 2_000_000_000,
      nominalUnitPrice: 40_000,
      totalUnits: 50_000,
      managementFeeRate: 0.012,          // 1.2%
      fundExpensesRate: 0.003,           // 0.3%
      upfrontFeeRate: 0.015,             // 1.5%
      successFeeOperational: 0.15,
      successFeeExit: 0.15,
      distributionPeriodicity: DistributionPeriodicity.QUARTERLY,
      hasDebt: false,
    },
  })

  // ─── Долг Фонда 1 ──────────────────────────────────────────────────────────
  await prisma.fundDebt.create({
    data: {
      fundId: fund1.id,
      lenderName: 'Сбербанк',
      principalAmount: 500_000_000,    // 500 млн ₽
      interestRate: 0.14,              // 14% годовых
      startDate: new Date('2023-07-01'),
      endDate: new Date('2028-07-01'),
      amortizationType: AmortizationType.ANNUITY,
    },
  })

  // ─── Объект 1: Бизнес-центр (Фонд 1) ──────────────────────────────────────
  // OPEX объекта:
  //   opexRate = 1 750 ₽/м²/год — управление и эксплуатация
  //   maintenanceRate = 800 ₽/м²/год — техническое обслуживание
  //   Налог на имущество: 1 850 000 000 × 2% = 37 000 000 ₽/год
  //   Налог на ЗУ: 350 000 000 × 0.15% = 525 000 ₽/год
  const prop1 = await prisma.property.create({
    data: {
      pipelineStatus: PipelineStatus.IN_FUND,
      name: 'Бизнес-центр «Арбат Плаза»',
      type: PropertyType.OFFICE,
      address: 'г. Москва, ул. Новый Арбат, д. 32',
      totalArea: 12_500,
      rentableArea: 10_800,
      cadastralValue: 1_850_000_000,
      landCadastralValue: 350_000_000,
      propertyTaxRate: 0.02,            // 2%
      landTaxRate: 0.0015,              // 0.15% (коммерческая земля, МСК)
      opexRate: 1_750,                  // ₽/м²/год
      maintenanceRate: 800,             // ₽/м²/год
      acquisitionPrice: 2_100_000_000,  // 2.1 млрд ₽
      purchaseDate: new Date('2021-03-15'),
      saleDate: new Date('2030-09-01'),
      exitCapRate: 0.09,                // 9%
      wacc: 0.16,                       // WACC 16%
    },
  })

  // Объект 1 — Арендаторы (3 договора)
  // opexReimbursementRate: ставка возмещения OPEX арендатором (₽/м²/год)
  await prisma.leaseContract.createMany({
    data: [
      {
        propertyId: prop1.id,
        tenantName: 'ООО «ТехноПарк»',
        area: 3_500,
        baseRent: 28_000,             // ₽/м²/год
        indexationType: IndexationType.CPI,
        opexReimbursementRate: 1_750, // возмещает полный OPEX
        opexReimbursementIndexationType: IndexationType.CPI,
        startDate: new Date('2022-01-01'),
        endDate: new Date('2026-12-31'),
        securityDeposit: 8_166_667,
        status: LeaseStatus.ACTIVE,
        renewalOption: true,
        breakOption: false,
        vatIncluded: false,
      },
      {
        propertyId: prop1.id,
        tenantName: 'АО «Консалт Групп»',
        area: 2_200,
        baseRent: 32_000,
        indexationType: IndexationType.FIXED,
        indexationRate: 0.05,           // 5% ежегодно
        opexReimbursementRate: 1_750,
        opexReimbursementIndexationType: IndexationType.FIXED,
        opexReimbursementIndexationRate: 0.04,
        startDate: new Date('2023-04-01'),
        endDate: new Date('2027-03-31'),
        securityDeposit: 5_866_667,
        status: LeaseStatus.ACTIVE,
        renewalOption: true,
        breakOption: true,
        vatIncluded: false,
      },
      {
        propertyId: prop1.id,
        tenantName: 'ИП Соколов Д.В.',
        area: 850,
        baseRent: 25_000,
        indexationType: IndexationType.FIXED,
        indexationRate: 0.04,
        opexReimbursementRate: 1_500,   // частичное возмещение
        opexReimbursementIndexationType: IndexationType.NONE,
        startDate: new Date('2021-09-01'),
        endDate: new Date('2025-08-31'),
        securityDeposit: 1_770_833,
        status: LeaseStatus.ACTIVE,
        renewalOption: false,
        breakOption: false,
        vatIncluded: false,
      },
    ],
  })

  // Объект 1 — CAPEX
  await prisma.capexItem.create({
    data: {
      propertyId: prop1.id,
      name: 'Модернизация системы вентиляции',
      amount: 15_000_000,
      plannedDate: new Date('2025-09-01'),
    },
  })

  // ─── Объект 2: Торговый центр (Фонд 1) ────────────────────────────────────
  // OPEX объекта:
  //   opexRate = 2 000 ₽/м²/год
  //   maintenanceRate = 900 ₽/м²/год
  //   Налог на имущество: 2 400 000 000 × 2% = 48 000 000 ₽/год
  //   Налог на ЗУ: 500 000 000 × 0.15% = 750 000 ₽/год
  const prop2 = await prisma.property.create({
    data: {
      pipelineStatus: PipelineStatus.IN_FUND,
      name: 'Торговый центр «Галерея Запад»',
      type: PropertyType.RETAIL,
      address: 'г. Москва, Кутузовский пр-т, д. 74',
      totalArea: 18_200,
      rentableArea: 14_500,
      cadastralValue: 2_400_000_000,
      landCadastralValue: 500_000_000,
      propertyTaxRate: 0.02,
      landTaxRate: 0.0015,
      opexRate: 2_000,
      maintenanceRate: 900,
      acquisitionPrice: 2_800_000_000,
      purchaseDate: new Date('2020-11-01'),
      saleDate: new Date('2030-09-01'),
      exitCapRate: 0.10,
      wacc: 0.17,                       // WACC 17%
    },
  })

  // Объект 2 — Арендаторы (3 договора)
  await prisma.leaseContract.createMany({
    data: [
      {
        propertyId: prop2.id,
        tenantName: 'X5 Retail Group (Перекрёсток)',
        area: 5_000,
        baseRent: 22_000,
        indexationType: IndexationType.CPI,
        opexReimbursementRate: 2_000,
        opexReimbursementIndexationType: IndexationType.CPI,
        startDate: new Date('2021-06-01'),
        endDate: new Date('2028-05-31'),
        securityDeposit: 9_166_667,
        status: LeaseStatus.ACTIVE,
        renewalOption: true,
        breakOption: false,
        vatIncluded: false,
      },
      {
        propertyId: prop2.id,
        tenantName: 'Zara (ООО «Индитекс Рус»)',
        area: 1_800,
        baseRent: 45_000,
        indexationType: IndexationType.FIXED,
        indexationRate: 0.06,
        opexReimbursementRate: 2_000,
        opexReimbursementIndexationType: IndexationType.FIXED,
        opexReimbursementIndexationRate: 0.04,
        startDate: new Date('2022-02-01'),
        endDate: new Date('2025-01-31'),
        securityDeposit: 6_750_000,
        status: LeaseStatus.TERMINATING,
        renewalOption: false,
        breakOption: false,
        vatIncluded: false,
      },
      {
        propertyId: prop2.id,
        tenantName: 'ООО «Аптека Столичная»',
        area: 280,
        baseRent: 55_000,
        indexationType: IndexationType.FIXED,
        indexationRate: 0.05,
        opexReimbursementRate: 1_800,
        opexReimbursementIndexationType: IndexationType.CPI,
        startDate: new Date('2023-01-01'),
        endDate: new Date('2026-12-31'),
        securityDeposit: 1_283_333,
        status: LeaseStatus.ACTIVE,
        renewalOption: true,
        breakOption: false,
        vatIncluded: false,
      },
    ],
  })

  // Объект 2 — CAPEX
  await prisma.capexItem.create({
    data: {
      propertyId: prop2.id,
      name: 'Ремонт кровли и фасада',
      amount: 22_000_000,
      plannedDate: new Date('2025-05-01'),
    },
  })

  // ─── Объект 3: Складской комплекс (Фонд 2) ────────────────────────────────
  // OPEX объекта:
  //   opexRate = 600 ₽/м²/год (складская ставка ниже)
  //   maintenanceRate = 300 ₽/м²/год
  //   Налог на имущество: 1 100 000 000 × 2.2% = 24 200 000 ₽/год
  //   Налог на ЗУ: 800 000 000 × 0.3% = 2 400 000 ₽/год (производственная земля МО)
  const prop3 = await prisma.property.create({
    data: {
      pipelineStatus: PipelineStatus.IN_FUND,
      name: 'Складской комплекс «Логистика Север»',
      type: PropertyType.WAREHOUSE,
      address: 'Московская обл., Дмитровский р-н, пос. Деденево',
      totalArea: 45_000,
      rentableArea: 42_000,
      cadastralValue: 1_100_000_000,
      landCadastralValue: 800_000_000,
      propertyTaxRate: 0.022,           // 2.2% (МО)
      landTaxRate: 0.003,               // 0.3% (производственная земля МО)
      opexRate: 600,
      maintenanceRate: 300,
      acquisitionPrice: 1_350_000_000,
      purchaseDate: new Date('2022-06-01'),
      saleDate: new Date('2032-09-01'),
      exitCapRate: 0.10,
      wacc: 0.15,                       // WACC 15%
    },
  })

  // Объект 3 — Арендаторы (2 договора)
  await prisma.leaseContract.createMany({
    data: [
      {
        propertyId: prop3.id,
        tenantName: 'Wildberries (ООО «Вайлдберриз»)',
        area: 28_000,
        baseRent: 6_500,              // складская ставка
        indexationType: IndexationType.CPI,
        opexReimbursementRate: 600,   // полное возмещение OPEX
        opexReimbursementIndexationType: IndexationType.CPI,
        startDate: new Date('2022-07-01'),
        endDate: new Date('2027-06-30'),
        securityDeposit: 15_166_667,
        status: LeaseStatus.ACTIVE,
        renewalOption: true,
        breakOption: false,
        vatIncluded: false,
      },
      {
        propertyId: prop3.id,
        tenantName: 'ООО «ФармаЛогистик»',
        area: 10_500,
        baseRent: 8_200,              // надбавка за фармацевтические условия хранения
        indexationType: IndexationType.FIXED,
        indexationRate: 0.05,
        opexReimbursementRate: 700,   // повышенный OPEX из-за спецусловий
        opexReimbursementIndexationType: IndexationType.FIXED,
        opexReimbursementIndexationRate: 0.04,
        startDate: new Date('2023-01-01'),
        endDate: new Date('2028-12-31'),
        securityDeposit: 7_175_000,
        status: LeaseStatus.ACTIVE,
        renewalOption: true,
        breakOption: false,
        vatIncluded: false,
      },
    ],
  })

  // Объект 3 — CAPEX
  await prisma.capexItem.create({
    data: {
      propertyId: prop3.id,
      name: 'Установка системы пожаротушения (спринклер)',
      amount: 35_000_000,
      plannedDate: new Date('2025-08-01'),
    },
  })

  // ─── Привязка объектов к фондам через FundProperty (100% владения) ────────
  await prisma.fundProperty.createMany({
    data: [
      { fundId: fund1.id, propertyId: prop1.id, ownershipPct: 100 },
      { fundId: fund1.id, propertyId: prop2.id, ownershipPct: 100 },
      { fundId: fund2.id, propertyId: prop3.id, ownershipPct: 100 },
    ],
  })

  console.log('Фонд 1:', fund1.name, `(${fund1.totalUnits.toLocaleString('ru')} паёв)`)
  console.log('Фонд 2:', fund2.name, `(${fund2.totalUnits.toLocaleString('ru')} паёв)`)
  console.log('Объект 1:', prop1.name, `(wacc=${prop1.wacc * 100}%, exitCapRate=${(prop1.exitCapRate ?? 0) * 100}%)`)
  console.log('Объект 2:', prop2.name, `(wacc=${prop2.wacc * 100}%, exitCapRate=${(prop2.exitCapRate ?? 0) * 100}%)`)
  console.log('Объект 3:', prop3.name, `(wacc=${prop3.wacc * 100}%, exitCapRate=${(prop3.exitCapRate ?? 0) * 100}%)`)
  console.log('Seed выполнен успешно.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
