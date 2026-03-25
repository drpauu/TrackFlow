// MongoDB Playground for TrackFlow
// Connection: select your active cluster in the MongoDB VS Code extension.
// Database used by the app: track-flow-db

use('track-flow-db');

// 1) List collections
db.getCollectionInfos({}, { nameOnly: true });

// 2) Show current users
db.users.find(
  {},
  {
    _id: 1,
    coachId: 1,
    role: 1,
    usernameLower: 1,
    isActive: 1,
    createdAt: 1,
    updatedAt: 1,
  }
).sort({ _id: 1 });

// 3) Show all documents in one collection
// db.state_cache.find({}).limit(20);
// db.athletes.find({}).limit(20);
// db.groups.find({}).limit(20);
// db.week_plans.find({}).limit(20);
// db.jogatina_groups.find({}).limit(20);

// 4) Insert one document example
// db.groups.insertOne({
//   _id: 'group_demo',
//   coachId: 'coach_default',
//   name: 'demo',
//   createdAt: new Date(),
//   updatedAt: new Date(),
// });

// 5) Update one document example
// db.users.updateOne(
//   { _id: 'coach:coach_default' },
//   {
//     $set: {
//       isActive: true,
//       updatedAt: new Date(),
//     },
//   }
// );

// 6) Delete one document example
// db.groups.deleteOne({ _id: 'group_demo' });

// 7) Delete all documents from one collection
// db.athletes.deleteMany({});

// 8) Count documents
// db.users.countDocuments({});
// db.athletes.countDocuments({});
// db.groups.countDocuments({});
// db.week_plans.countDocuments({});

// 9) Dangerous: wipe functional data but keep users
// db.state_cache.deleteMany({});
// db.athletes.deleteMany({});
// db.groups.deleteMany({});
// db.week_plans.deleteMany({});
// db.trainings.deleteMany({});
// db.competitions.deleteMany({});
// db.jogatina_groups.deleteMany({});
// db.jogatina_memberships.deleteMany({});
// db.jogatina_wallets.deleteMany({});
// db.jogatina_bets_open.deleteMany({});
// db.jogatina_wagers_open.deleteMany({});
// db.jogatina_ledger.deleteMany({});
// db.jogatina_daily_bonus_claims.deleteMany({});
// db.jogatina_group_carryover.deleteMany({});
// db.sync_counters.deleteMany({});

// 10) Important note about passwords
// Do not write plain text passwords into Mongo.
// This app stores passwords as scrypt hashes in users.passwordHash.
// If you need to change a password, use an app script or ask me to generate/apply the hash.
