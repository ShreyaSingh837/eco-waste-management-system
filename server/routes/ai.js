const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// ── Multer setup (memory storage for AI processing) ──────────────────────────
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        cb(null, allowed.includes(file.mimetype));
    }
});

// ── Gemini Vision helper ──────────────────────────────────────────────────────
async function classifyWithGemini(imageBase64, mimeType) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const prompt = `You are a waste classification AI for an eco-management system.
Analyze this image and identify the type of waste. Respond ONLY with valid JSON:
{
  "category": "biodegradable" | "recyclable" | "hazardous" | "general",
  "waste_name": "e.g. Plastic Bottle",
  "confidence": 0-100,
  "disposal_instructions": "brief 1-2 sentence instruction",
  "eco_tips": ["tip1", "tip2", "tip3"],
  "bin_color": "Green" | "Blue" | "Orange" | "Black"
}`;

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: mimeType, data: imageBase64 } }
                    ]
                }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
            })
        });
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonStr = text.match(/\{[\s\S]*\}/)?.[0];
        if (jsonStr) return JSON.parse(jsonStr);
    } catch (e) {
        console.error('Gemini Vision error:', e.message);
    }
    return null;
}

// ── Rule-based smart classifier (works without API key) ──────────────────────
function ruleBasedClassify(filename = '', fileSizeKB = 0) {
    const name = filename.toLowerCase();
    const categories = {
        biodegradable: {
            keywords: ['food','fruit','vegetable','leaf','leaves','grass','garden','organic','banana','apple','kitchen','compost','green'],
            waste_name: 'Organic / Biodegradable Waste',
            bin_color: 'Green',
            disposal_instructions: 'Place in the Green bin. Organic waste can be composted to create nutrient-rich fertilizer.',
            eco_tips: ['Start a compost bin at home to recycle food waste.', 'Avoid mixing biodegradable and non-biodegradable waste.', 'Use organic waste as garden fertilizer.']
        },
        recyclable: {
            keywords: ['plastic','bottle','paper','card','box','can','tin','glass','jar','metal','aluminum','aluminium','carton','newspaper','magazine'],
            waste_name: 'Recyclable Waste',
            bin_color: 'Blue',
            disposal_instructions: 'Rinse and place in the Blue bin. Keep items clean and dry for better recycling efficiency.',
            eco_tips: ['Rinse containers before recycling to reduce contamination.', 'Flatten cardboard boxes to save space.', 'Remove caps and lids from bottles before recycling.']
        },
        hazardous: {
            keywords: ['battery','electronic','phone','laptop','computer','cable','wire','bulb','chemical','paint','medicine','syringe','needle'],
            waste_name: 'Hazardous / E-Waste',
            bin_color: 'Orange (Special Handling)',
            disposal_instructions: 'Do NOT place in regular bins. Requires special collection. Contact EcoWaste for scheduled hazardous waste pickup.',
            eco_tips: ['Never dispose of electronics in regular trash.', 'Return used batteries to certified collection points.', 'Check for e-waste collection drives in your area.']
        }
    };

    for (const [cat, info] of Object.entries(categories)) {
        if (info.keywords.some(kw => name.includes(kw))) {
            return { category: cat, confidence: 72, ...info };
        }
    }

    // Default — general waste
    return {
        category: 'general',
        waste_name: 'Mixed General Waste',
        confidence: 55,
        bin_color: 'Black',
        disposal_instructions: 'Place in the Black bin. Try to reduce, reuse, and recycle before resorting to general waste disposal.',
        eco_tips: ['Reduce waste at the source by choosing products with less packaging.', 'Reuse items whenever possible before discarding.', 'When in doubt, check the EcoWaste guide for proper disposal.']
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/ai/classify-waste  — AI Waste Image Classifier
// ══════════════════════════════════════════════════════════════════════════════
router.post('/classify-waste', authenticateToken, upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image uploaded' });
    }

    const imageBase64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    const filename = req.file.originalname;
    const sizeKB = Math.round(req.file.size / 1024);

    // Try Gemini Vision first, fall back to rule-based
    let result = await classifyWithGemini(imageBase64, mimeType);
    const aiPowered = !!result;

    if (!result) {
        result = ruleBasedClassify(filename, sizeKB);
    }

    // Enrich with waste type data from database
    const [wasteTypes] = await pool.execute(
        "SELECT * FROM waste_types WHERE category = ? LIMIT 1",
        [result.category]
    );

    const categoryColors = {
        biodegradable: '#2E7D32',
        recyclable: '#1565C0',
        hazardous: '#E65100',
        general: '#424242'
    };

    res.json({
        success: true,
        ai_powered: aiPowered,
        result: {
            ...result,
            category_color: categoryColors[result.category] || '#424242',
            waste_type_db: wasteTypes[0] || null
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/ai/chat  — AI Eco-Chatbot
// ══════════════════════════════════════════════════════════════════════════════
const chatKnowledgeBase = [
    { patterns: ['hello','hi','hey','good morning','good evening'], response: "Hello! 👋 I'm EcoBot, your smart waste management assistant. I can help you with waste disposal, pickup requests, recycling tips, and more! What would you like to know?" },
    { patterns: ['biodegradable','compost','organic','food waste','kitchen waste','vegetable','fruit'], response: "🌿 **Biodegradable Waste** goes in the **Green Bin**.\n\nExamples: food scraps, vegetable peels, fruit waste, garden clippings, tea bags.\n\n✅ **Best Practice:** Start a compost bin! Biodegradable waste turns into nutrient-rich fertilizer for plants in 6–8 weeks." },
    { patterns: ['recycle','recyclable','plastic','paper','glass','metal','bottle','cardboard'], response: "♻️ **Recyclable Waste** goes in the **Blue Bin**.\n\nExamples: plastic bottles, cardboard boxes, newspapers, glass jars, aluminum cans.\n\n✅ **Tips:** Always rinse containers before recycling. Flatten cardboard to save space. Remove food residue for cleaner recycling." },
    { patterns: ['hazardous','battery','electronic','ewaste','e-waste','chemical','paint','medicine'], response: "⚠️ **Hazardous Waste** requires **Special Handling** (Orange/Red).\n\nExamples: batteries, old phones/laptops, paint, medicines, syringes.\n\n⚠️ **Never** put these in regular bins! Schedule a special hazardous waste pickup through your dashboard." },
    { patterns: ['schedule','pickup','request','book','arrange'], response: "📅 **Scheduling a Pickup** is easy!\n\n1. Go to your **Dashboard**\n2. Click **'Schedule Pickup'** or **New Request**\n3. Select waste type, address & preferred date/time\n4. Submit — we confirm within hours!\n\nYou can track your request status in real-time from 'My Requests'." },
    { patterns: ['track','status','where','update','progress'], response: "📍 **Track Your Pickup Request:**\n\nGo to **My Requests** in your dashboard. Each request shows:\n- 🟡 Pending → 🔵 Confirmed → 🟣 Assigned → 🔄 In Progress → ✅ Completed\n\nYou'll also receive real-time notifications for every status change!" },
    { patterns: ['cancel','cancellation'], response: "❌ **Cancelling a Request:**\n\nYou can cancel a pending or confirmed request from **My Requests** → click the 'Cancel' button next to the request.\n\n⚠️ Requests that are already 'In Progress' cannot be cancelled." },
    { patterns: ['reduce','reuse','tips','eco','sustainable','environment','green living'], response: "🌍 **Eco-Friendly Tips:**\n\n1. **Reduce** — Buy only what you need; choose products with minimal packaging.\n2. **Reuse** — Use reusable bags, bottles, and containers.\n3. **Recycle** — Segregate waste and place in the right bin.\n4. **Compost** — Turn food waste into garden fertilizer.\n5. **Refuse** — Say no to single-use plastics!\n\nEvery small action counts! 💚" },
    { patterns: ['vehicle','driver','truck'], response: "🚛 **Our Collection Fleet** includes:\n\n- Heavy Trucks (5000 kg capacity) for bulk waste\n- Medium Trucks (3000 kg) for residential areas\n- Collection Vans (1500 kg) for small pickups\n- Hazmat Trucks for hazardous materials\n\nVehicles are assigned automatically based on your waste type and quantity." },
    { patterns: ['contact','support','help','phone','email'], response: "📞 **Contact EcoWaste Support:**\n\n- 📧 Email: support@ecowaste.com\n- 📞 Phone: +91 98765 43210\n- ⏰ Hours: Monday–Saturday, 8 AM – 8 PM\n\nFor urgent hazardous waste issues, we are available 24/7." },
    { patterns: ['time','slot','morning','afternoon','evening','when'], response: "⏰ **Available Pickup Time Slots:**\n\n🌅 **Morning:** 7 AM – 12 PM (most popular)\n☀️ **Afternoon:** 12 PM – 5 PM\n🌆 **Evening:** 5 PM – 8 PM\n\n💡 **AI Tip:** Morning slots typically result in faster service as our vehicles start fresh routes!" },
    { patterns: ['price','cost','fee','charge','free'], response: "💰 **EcoWaste Pricing:**\n\nBasic household waste collection is **FREE** for registered users! 🎉\n\nSpecial collections (hazardous, bulk, e-waste) may have a nominal handling fee. You'll be notified before confirmation." },
    { patterns: ['register','signup','account','new user'], response: "📝 **Creating an Account:**\n\n1. Click **'Login / Register'** on the homepage\n2. Go to **'Sign Up'** tab\n3. Enter your name, email, phone, and address\n4. Set a password (min. 6 characters)\n5. Done! Your account is ready instantly. 🚀" },
    { patterns: ['ai','artificial intelligence','smart','image','classify','classify waste'], response: "🤖 **AI-Powered Features in EcoWaste:**\n\n1. **Waste Classifier** — Upload a photo and AI instantly identifies waste type!\n2. **Smart Chatbot** — That's me! I answer your questions instantly.\n3. **Pickup Recommendations** — AI suggests optimal pickup dates.\n4. **Eco Analytics** — Admin dashboard shows AI-driven waste trends.\n\nGo to **AI Tools** in your dashboard to try the waste classifier!" },
];

async function getChatbotResponseAI(message) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const systemPrompt = `You are EcoBot, a friendly AI assistant for EcoWaste Management System. 
You help users with: waste disposal methods, pickup scheduling, recycling tips, eco-friendly practices, and general queries about the waste management system.
Keep responses concise (under 150 words), friendly, and use emojis sparingly. 
If a question is completely unrelated to waste management, politely redirect to your area of expertise.`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemPrompt}\n\nUser: ${message}` }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 256 }
            })
        });
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch { return null; }
}

router.post('/chat', authenticateToken, async (req, res) => {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, message: 'Message required' });

    const lower = message.toLowerCase();

    // Try Gemini first
    const aiResponse = await getChatbotResponseAI(message);
    if (aiResponse) {
        return res.json({ success: true, response: aiResponse, ai_powered: true });
    }

    // Rule-based fallback
    for (const kb of chatKnowledgeBase) {
        if (kb.patterns.some(p => lower.includes(p))) {
            return res.json({ success: true, response: kb.response, ai_powered: false });
        }
    }

    res.json({
        success: true,
        ai_powered: false,
        response: "🤔 I'm not sure about that specific question! I can help you with:\n\n- ♻️ Waste segregation (biodegradable/recyclable/hazardous)\n- 📅 Scheduling & tracking pickups\n- 🌍 Eco-friendly tips\n- 🤖 Using the AI waste classifier\n\nTry asking something like: *'How do I dispose of batteries?'* or *'Schedule a pickup'*"
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/ai/recommendations  — Smart Pickup Recommendations
// ══════════════════════════════════════════════════════════════════════════════
router.get('/recommendations', authenticateToken, async (req, res) => {
    try {
        // Analyze user's history
        const [history] = await pool.execute(
            "SELECT preferred_time_slot, preferred_date, waste_type_id, status FROM pickup_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
            [req.user.id]
        );

        // Count slot preferences
        const slotCount = { morning: 0, afternoon: 0, evening: 0 };
        history.forEach(r => { if (slotCount[r.preferred_time_slot] !== undefined) slotCount[r.preferred_time_slot]++; });
        const bestSlot = Object.entries(slotCount).sort((a,b) => b[1]-a[1])[0]?.[0] || 'morning';

        // Get next weekday dates
        const today = new Date();
        const recommendations = [];
        let d = new Date(today);
        d.setDate(d.getDate() + 1);

        while (recommendations.length < 3) {
            const day = d.getDay();
            if (day !== 0) { // Skip Sundays
                recommendations.push({
                    date: d.toISOString().split('T')[0],
                    day: d.toLocaleDateString('en-IN', { weekday: 'long' }),
                    time_slot: bestSlot,
                    reason: day === 1 ? 'Monday morning pickups are fastest — vehicles start fresh routes!' :
                            day === 6 ? 'Saturday is great for bulk cleanup pickups.' :
                            `${d.toLocaleDateString('en-IN', { weekday: 'long' })} availability looks good based on your area's demand.`,
                    score: day === 1 ? 95 : day === 6 ? 88 : 78 + Math.floor(Math.random() * 10)
                });
            }
            d.setDate(d.getDate() + 1);
        }

        // Check available vehicles
        const [vehicles] = await pool.execute("SELECT COUNT(*) as count FROM vehicles WHERE status = 'available'");
        const availableNow = vehicles[0].count;

        res.json({
            success: true,
            preferred_slot: bestSlot,
            total_requests: history.length,
            available_vehicles: availableNow,
            recommendations,
            eco_insight: availableNow > 1
                ? `✅ ${availableNow} vehicles are available. Scheduling now ensures fast service!`
                : '⚠️ High demand period. Booking early is recommended.'
        });
    } catch (error) {
        console.error('Recommendations error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/ai/analytics  — Admin AI Trend Analytics
// ══════════════════════════════════════════════════════════════════════════════
router.get('/analytics', authenticateToken, async (req, res) => {
    try {
        // Waste category breakdown
        const [categoryStats] = await pool.execute(`
            SELECT wt.category, wt.name, COUNT(pr.id) as requests, SUM(pr.quantity_kg) as total_kg
            FROM pickup_requests pr
            JOIN waste_types wt ON pr.waste_type_id = wt.id
            GROUP BY wt.category, wt.name
            ORDER BY requests DESC`
        );

        // Time slot popularity
        const [slotStats] = await pool.execute(`
            SELECT preferred_time_slot, COUNT(*) as count
            FROM pickup_requests GROUP BY preferred_time_slot`
        );

        // Daily requests over last 14 days
        const [dailyStats] = await pool.execute(`
            SELECT date(created_at) as day, COUNT(*) as count
            FROM pickup_requests
            WHERE created_at >= date('now', '-14 days')
            GROUP BY day ORDER BY day`
        );

        // Status distribution
        const [statusStats] = await pool.execute(`
            SELECT status, COUNT(*) as count FROM pickup_requests GROUP BY status`
        );

        // Completion rate
        const [totals] = await pool.execute(`SELECT COUNT(*) as total FROM pickup_requests`);
        const [completed] = await pool.execute(`SELECT COUNT(*) as c FROM pickup_requests WHERE status='completed'`);
        const completionRate = totals[0].total > 0
            ? Math.round((completed[0].c / totals[0].total) * 100) : 0;

        // AI-generated insight
        const insight = completionRate >= 80
            ? `🌟 Excellent! ${completionRate}% completion rate. Operations are running efficiently.`
            : completionRate >= 60
            ? `📈 Good progress at ${completionRate}% completion. Focus on reducing pending requests.`
            : `⚠️ Completion rate is ${completionRate}%. Consider deploying more vehicles during peak hours.`;

        // Simulate 7-day forecast
        const forecast = Array.from({length: 7}, (_, i) => {
            const fd = new Date(); fd.setDate(fd.getDate() + i + 1);
            const avg = Math.max(0, totals[0].total / 14);
            const weekendDip = fd.getDay() === 0 ? 0.5 : 1;
            return {
                date: fd.toISOString().split('T')[0],
                day: fd.toLocaleDateString('en-IN', { weekday: 'short' }),
                predicted_requests: Math.round(avg * weekendDip * (0.85 + Math.random() * 0.3))
            };
        });

        res.json({
            success: true,
            completion_rate: completionRate,
            ai_insight: insight,
            category_stats: categoryStats,
            slot_stats: slotStats,
            daily_stats: dailyStats,
            status_stats: statusStats,
            forecast
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/ai/eco-tips  — Daily AI Eco Tips
// ══════════════════════════════════════════════════════════════════════════════
const ECO_TIPS = [
    { tip: "Use a compost bin for kitchen waste to reduce landfill waste by up to 30%!", icon: "🌿", category: "Biodegradable" },
    { tip: "Rinse plastic containers before recycling — contaminated plastics often end up in landfills.", icon: "♻️", category: "Recyclable" },
    { tip: "Switch to LED bulbs and properly dispose of CFL/fluorescent lamps at certified e-waste centers.", icon: "💡", category: "Hazardous" },
    { tip: "Carry reusable bags to reduce plastic waste. One reusable bag can replace 700 plastic bags!", icon: "🛍️", category: "Reduce" },
    { tip: "Paper towels can't be recycled. Use cloth towels instead — they are 100% reusable!", icon: "📄", category: "Recyclable" },
    { tip: "Flatten cardboard boxes before recycling to save 4x the space in collection trucks.", icon: "📦", category: "Recyclable" },
    { tip: "Never pour cooking oil down the drain — it pollutes waterways. Collect and dispose properly.", icon: "🫙", category: "Hazardous" },
    { tip: "Schedule your pickup during morning slots for fastest service and lowest vehicle emissions.", icon: "🌅", category: "Pickup Tip" },
];

router.get('/eco-tips', authenticateToken, (req, res) => {
    const idx = new Date().getDate() % ECO_TIPS.length;
    const tip = ECO_TIPS[idx];
    const extras = ECO_TIPS.filter((_, i) => i !== idx).sort(() => Math.random() - 0.5).slice(0, 2);
    res.json({ success: true, daily_tip: tip, more_tips: extras });
});

module.exports = router;
