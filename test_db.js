// Full end-to-end route test
const { pool } = require('./server/config/database');

(async () => {
  try {
    // Simulate exactly what the /api/admin/dashboard does
    const [totalRequests]    = await pool.execute("SELECT COUNT(*) as count FROM pickup_requests");
    const [pendingRequests]  = await pool.execute("SELECT COUNT(*) as count FROM pickup_requests WHERE status = 'pending'");
    const [completedReqs]    = await pool.execute("SELECT COUNT(*) as count FROM pickup_requests WHERE status = 'completed'");
    const [totalUsers]       = await pool.execute("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
    const [totalVehicles]    = await pool.execute("SELECT COUNT(*) as count FROM vehicles");
    const [availableVehicles]= await pool.execute("SELECT COUNT(*) as count FROM vehicles WHERE status = 'available'");
    const [totalWaste]       = await pool.execute("SELECT SUM(quantity_kg) as total FROM pickup_requests WHERE status = 'completed'");

    const [recentRequests] = await pool.execute(
      `SELECT pr.*, u.name as user_name, wt.name as waste_type_name, wt.icon as waste_icon
       FROM pickup_requests pr
       LEFT JOIN users u ON pr.user_id = u.id
       LEFT JOIN waste_types wt ON pr.waste_type_id = wt.id
       ORDER BY pr.created_at DESC LIMIT 10`
    );

    console.log('✅ Dashboard API simulation passed!');
    console.log('Stats:', {
      totalRequests: totalRequests[0].count,
      pendingRequests: pendingRequests[0].count,
      completedRequests: completedReqs[0].count,
      totalUsers: totalUsers[0].count,
      totalVehicles: totalVehicles[0].count,
      availableVehicles: availableVehicles[0].count,
      totalWasteCollected: totalWaste[0].total || 0
    });
    console.log('Recent requests:', recentRequests.length);
  } catch(e) {
    console.error('❌ FAILED:', e.message);
  }
})();
