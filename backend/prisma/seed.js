/**
 * Seed: demo owner (email owner@finbook.dev, password demo123), one business,
 * customers/suppliers, ledger entries, items, an invoice and expenses.
 * Run: npm run seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const main = async () => {
  const owner = await prisma.user.upsert({
    where: { email: 'owner@finbook.dev' },
    update: {},
    create: {
      name: 'Demo Owner',
      email: 'owner@finbook.dev',
      phone: null,
      passwordHash: await bcrypt.hash('demo123', 10),
      role: 'ADMIN',
    },
  });

  let business = await prisma.business.findFirst({ where: { ownerId: owner.id } });
  if (!business) {
    business = await prisma.business.create({
      data: {
        name: 'Sri Ganesh Traders',
        ownerId: owner.id,
        email: 'owner@finbook.dev',
        address: '12 Market Road, Chennai',
        gstin: '33ABCDE1234F1Z5',
        category: 'Kirana / General Store',
        members: { create: { userId: owner.id, role: 'OWNER' } },
      },
    });
  }

  const partyCount = await prisma.party.count({ where: { businessId: business.id } });
  if (partyCount === 0) {
    const siva = await prisma.party.create({
      data: { businessId: business.id, type: 'CUSTOMER', name: 'Siva', phone: null, email: null, city: 'Chennai' },
    });
    const priya = await prisma.party.create({
      data: { businessId: business.id, type: 'CUSTOMER', name: 'Priya Stores', phone: null, email: null },
    });
    const karthick = await prisma.party.create({
      data: { businessId: business.id, type: 'SUPPLIER', name: 'Karthick', phone: null, email: null },
    });

    const mkTx = (partyId, type, amount, description, daysAgo = 0) => ({
      businessId: business.id,
      partyId,
      createdById: owner.id,
      type,
      amount,
      description,
      entryDate: new Date(Date.now() - daysAgo * 86_400_000),
    });
    await prisma.transaction.createMany({
      data: [
        mkTx(siva.id, 'GAVE', 500, 'Groceries on credit', 3),
        mkTx(priya.id, 'GAVE', 1200, 'Monthly supplies', 5),
        mkTx(priya.id, 'GOT', 700, 'Part payment', 1),
        mkTx(karthick.id, 'GAVE', 50000, 'Advance for stock', 2),
        mkTx(karthick.id, 'GOT', 25000, 'Stock delivered adjustment', 1),
      ],
    });
    await prisma.cashbookEntry.createMany({
      data: [
        { businessId: business.id, direction: 'IN', amount: 700, description: 'Payment from Priya Stores' },
        { businessId: business.id, direction: 'OUT', amount: 50000, description: 'Advance to Karthick', paymentMode: 'BANK' },
      ],
    });
    await prisma.expense.createMany({
      data: [
        { businessId: business.id, category: 'Rent', amount: 8000, notes: 'Shop rent - July' },
        { businessId: business.id, category: 'Electricity', amount: 1450 },
      ],
    });
    await prisma.item.createMany({
      data: [
        { businessId: business.id, name: 'Rice Bag 25kg', unit: 'BAG', salePrice: 1450, purchasePrice: 1300, stockQty: 40, lowStockAlert: 10 },
        { businessId: business.id, name: 'Sunflower Oil 1L', unit: 'PCS', salePrice: 145, purchasePrice: 128, stockQty: 120, lowStockAlert: 24, taxRate: 5 },
      ],
    });
  }

  console.log('Seed complete. Login: email owner@finbook.dev / password demo123');
};

main().finally(() => prisma.$disconnect());
