import { pool } from "./index";
import { logAuditEvent } from "./audit";

export async function runIdempotentSeed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Seed Sector
    const sectorRes = await client.query(`
      INSERT INTO sectors (code, name)
      VALUES ('CON', 'Construction Skill Development Council of India (CSDCI)')
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const sectorId = sectorRes.rows[0].id;

    // 2. Seed Qualification (CON/Q0602) with NQR Provenance
    const qpRes = await client.query(`
      INSERT INTO qualifications (
        sector_id,
        qp_code,
        nqr_code,
        name,
        nsqf_level,
        version,
        source_url,
        verified,
        is_synthetic
      ) VALUES (
        $1,
        'CON/Q0602',
        'QG-03-CO-03951-2025-V2-CSDCI',
        'Assistant Electrician',
        3,
        '2.0',
        'https://www.nqr.gov.in/qualifications/13772',
        true,
        false
      )
      ON CONFLICT (qp_code) DO UPDATE SET
        nqr_code = EXCLUDED.nqr_code,
        name = EXCLUDED.name,
        nsqf_level = EXCLUDED.nsqf_level,
        version = EXCLUDED.version,
        source_url = EXCLUDED.source_url,
        verified = EXCLUDED.verified
      RETURNING id;
    `, [sectorId]);
    const qpId = qpRes.rows[0].id;

    // 3. Seed Platform Setting for Passing Threshold (Configurable & UNVERIFIED)
    await client.query(`
      INSERT INTO platform_settings (key, value, verified, note)
      VALUES (
        'pass_threshold_percent',
        '{"threshold": 50, "nsqf_level": 3}'::jsonb,
        false,
        'Draft value derived from PMKVY RPL assessment guidelines; requires SSC/NCVET Gazette confirmation for CON/Q0602 v2'
      )
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        verified = EXCLUDED.verified,
        note = EXCLUDED.note;
    `);

    // 4. Seed Official NOS Units (Titles strictly matching NQR)
    const officialNosData = [
      {
        code: "CON/N0602",
        title: "Handle hand and power tools relevant to construction electrical works",
        isCore: true,
        sourceUrl: "https://www.nqr.gov.in/qualifications/13772#CON-N0602",
        verified: true,
        criteria: [
          {
            code: "PC1.1",
            description: "Select insulated hand tools (pliers, screwdrivers, strippers) rated up to 1000V suitable for the electrical task",
            assessableFromVideo: "yes",
            requiresPhysical: false,
            weight: 2.0,
            rubric: {
              level1: "Uses uninsulated or damaged tools; ignores voltage safety rating (draft - needs assessor review)",
              level2: "Selects correct tool with prompting; does not inspect insulation prior to use (draft - needs assessor review)",
              level3: "Independently inspects and uses certified 1000V VDE insulated tools with proper grip (draft - needs assessor review)",
              level4: "Flawlessly selects tools, demonstrates pre-use defect check, and articulates double-insulation safety rationale (draft - needs assessor review)",
            },
          },
          {
            code: "PC1.2",
            description: "Operate electric rotary hammer and wall chaser machines following dust protection and electrical safety guidelines",
            assessableFromVideo: "yes",
            requiresPhysical: false,
            weight: 2.5,
            rubric: {
              level1: "Fails to wear eye/ear PPE; holds power tool with unsteady grip risking kickback (draft - needs assessor review)",
              level2: "Wears partial PPE; operates tool at awkward angle; requires posture correction (draft - needs assessor review)",
              level3: "Full PPE engaged; executes controlled wall cuts with proper two-handed firm stance (draft - needs assessor review)",
              level4: "Exemplary posture, checks tool cable integrity, manages dust collection, and halts safely before resting tool (draft - needs assessor review)",
            },
          },
          {
            code: "PC1.3",
            description: "Perform crimping of cable ends using manual or hydraulic crimping pliers ensuring tight mechanical bond",
            assessableFromVideo: "partial",
            requiresPhysical: true,
            weight: 2.0,
            rubric: {
              level1: "Loose crimp; conductor strands exposed or cut; ferrule wrong size (draft - needs assessor review)",
              level2: "Ferrule fits but crimp is uneven or slightly loose on pull test (draft - needs assessor review)",
              level3: "Appropriate ferrule gauge selected; crimped firmly with no loose strands (draft - needs assessor review)",
              level4: "Perfect crimp contour, zero strand damage, passes full tensile pull-out physical test (draft - needs assessor review)",
            },
          },
        ],
      },
      {
        code: "CON/N0603",
        title: "Install temporary lighting arrangement at construction sites",
        isCore: true,
        sourceUrl: "https://www.nqr.gov.in/qualifications/13772#CON-N0603",
        verified: true,
        criteria: [
          {
            code: "PC2.1",
            description: "Route temporary overhead cables at a minimum clearance height using non-conductive supports",
            assessableFromVideo: "yes",
            requiresPhysical: false,
            weight: 2.0,
            rubric: {
              level1: "Leaves live cables trailing across wet floors or walkways without elevation (draft - needs assessor review)",
              level2: "Elevates cables partially but attaches them to metallic scaffolding conductors (draft - needs assessor review)",
              level3: "Fastens overhead cabling using insulated hooks/nylon ties at safe height (>2.5m) (draft - needs assessor review)",
              level4: "Optimal route selection avoiding heavy machinery paths, securely strain-relieved and clearly labelled (draft - needs assessor review)",
            },
          },
          {
            code: "PC2.2",
            description: "Connect weather-resistant luminaire fittings with proper polarity (Phase to switch/center contact)",
            assessableFromVideo: "yes",
            requiresPhysical: false,
            weight: 2.5,
            rubric: {
              level1: "Reverses polarity; exposes live terminal brass to exterior touch (draft - needs assessor review)",
              level2: "Correct polarity achieved after trial; weather-seal gasket misaligned (draft - needs assessor review)",
              level3: "Consistently wires phase to switched center contact; seals IP-rated gland securely (draft - needs assessor review)",
              level4: "Demonstrates verification using test lamp/meter; explains electric shock risk of reversed polarity (draft - needs assessor review)",
            },
          },
        ],
      },
      {
        code: "CON/N0604",
        title: "Install LV electrical wiring at permanent structures",
        isCore: true,
        sourceUrl: "https://www.nqr.gov.in/qualifications/13772#CON-N0604",
        verified: true,
        criteria: [
          {
            code: "PC3.1",
            description: "Draw copper PVC insulated single-core wires through conduit using steel fish-tape without stripping jacket",
            assessableFromVideo: "yes",
            requiresPhysical: false,
            weight: 3.0,
            rubric: {
              level1: "Yanks cable causing stretching and abrasion damage; forces tangled bunch (draft - needs assessor review)",
              level2: "Draws wires with helper but applies excessive pulling tension at conduit bends (draft - needs assessor review)",
              level3: "Smoothly feeds and pulls lubricated fish tape; maintains color coding (Red/Yellow/Blue, Black, Green) (draft - needs assessor review)",
              level4: "Flawless group pull, leaves appropriate 150mm loop length at junction boxes, zero jacket abrasion (draft - needs assessor review)",
            },
          },
          {
            code: "PC3.2",
            description: "Terminate wires into modular switches, socket-outlets, and ceiling roses with firm screw tightening",
            assessableFromVideo: "partial",
            requiresPhysical: true,
            weight: 2.5,
            rubric: {
              level1: "Over-tightens stripping screw thread or leaves copper exposed outside terminal clamp (draft - needs assessor review)",
              level2: "Terminal holds wire but insulation is pinched under contact clamp (draft - needs assessor review)",
              level3: "Stripped exact length (8-10mm); conductor fully seated; terminal screw torqued firmly (draft - needs assessor review)",
              level4: "Exemplary neatness, uniform wire dressing, zero exposed copper, passes physical torque tug test (draft - needs assessor review)",
            },
          },
        ],
      },
      {
        code: "CON/N0605",
        title: "Assemble, install and maintain temporary LV electrical panels (distribution boards) at construction sites",
        isCore: true,
        sourceUrl: "https://www.nqr.gov.in/qualifications/13772#CON-N0605",
        verified: true,
        criteria: [
          {
            code: "PC4.1",
            description: "Mount DIN-rail, Miniature Circuit Breakers (MCBs), and Residual Current Circuit Breakers (RCCBs) in enclosure",
            assessableFromVideo: "yes",
            requiresPhysical: false,
            weight: 3.0,
            rubric: {
              level1: "Mounts incorrect current-rated breaker; fails to lock breaker onto DIN-rail snap (draft - needs assessor review)",
              level2: "Mounts on DIN rail but leaves busbar exposed without protective comb shroud (draft - needs assessor review)",
              level3: "Selects correct MCB curve/rating (e.g. C16, C20); secures tightly onto DIN rail with busbar cover (draft - needs assessor review)",
              level4: "Perfect layout hierarchy (Main Isolator -> RCCB 30mA -> Individual MCB circuits); labels each circuit leg (draft - needs assessor review)",
            },
          },
          {
            code: "PC4.2",
            description: "Connect protective earth (PE) conductor to panel distribution earth busbar and test ground continuity",
            assessableFromVideo: "partial",
            requiresPhysical: true,
            weight: 3.0,
            rubric: {
              level1: "Omits earth connection or bridges neutral bar directly to earth bar downstream of RCCB (draft - needs assessor review)",
              level2: "Connects green earth wire with flimsy thimble; does not clean paint from chassis contact point (draft - needs assessor review)",
              level3: "Scrapes enclosure chassis to bare metal; bolts green-yellow earth conductor with spring washer to earth bar (draft - needs assessor review)",
              level4: "Demonstrates earth continuity measurement (<1 Ohm) with multimeter; explains nuisance tripping avoidance (draft - needs assessor review)",
            },
          },
        ],
      },
      {
        code: "CON/N8001",
        title: "Work effectively in a team to deliver desired results at the workplace",
        isCore: false,
        sourceUrl: "https://www.nqr.gov.in/qualifications/13772#CON-N8001",
        verified: true,
        criteria: [
          {
            code: "PC5.1",
            description: "Communicate clearly with lead supervisor and trade peers regarding work sequence and hazard handovers",
            assessableFromVideo: "yes",
            requiresPhysical: false,
            weight: 1.0,
            rubric: {
              level1: "Refuses to communicate or conceals site errors/sparks (draft - needs assessor review)",
              level2: "Reports only when questioned; uses ambiguous terminology (draft - needs assessor review)",
              level3: "Communicates work status proactively; follows supervisor instructions clearly (draft - needs assessor review)",
              level4: "Exemplary briefing, verifies understanding with helper, gives concise lockout/tagout warning (draft - needs assessor review)",
            },
          },
        ],
      },
      {
        code: "CON/N8002",
        title: "Plan and organize work to meet expected outcomes",
        isCore: false,
        sourceUrl: "https://www.nqr.gov.in/qualifications/13772#CON-N8002",
        verified: true,
        criteria: [
          {
            code: "PC6.1",
            description: "Prepare materials, cables, and tools prior to commencing task to minimize job stoppage",
            assessableFromVideo: "yes",
            requiresPhysical: false,
            weight: 1.0,
            rubric: {
              level1: "Begins installation without required fasteners; frequently abandons workstation (draft - needs assessor review)",
              level2: "Prepares basic tools but underestimates wire quantity required for run (draft - needs assessor review)",
              level3: "Prepares full tool tote and calculated cable lengths before beginning work (draft - needs assessor review)",
              level4: "Optimized staging, maintains tidy work envelope, organizes hardware in segmented trays (draft - needs assessor review)",
            },
          },
        ],
      },
      {
        code: "CON/N9001",
        title: "Work according to personal health, safety and environment protocol at construction sites",
        isCore: true,
        sourceUrl: "https://www.nqr.gov.in/qualifications/13772#CON-N9001",
        verified: true,
        criteria: [
          {
            code: "PC7.1",
            description: "Wear mandatory personal protective equipment (safety helmet, safety shoes with electrical rating, eye protection)",
            assessableFromVideo: "yes",
            requiresPhysical: false,
            weight: 2.0,
            rubric: {
              level1: "Works barefoot or in flip-flops without hardhat or eye protection (draft - needs assessor review)",
              level2: "Wears helmet but leaves chinstrap undone; uses non-dielectric ordinary footwear (draft - needs assessor review)",
              level3: "Full compliant PPE donned properly throughout all practical demonstration steps (draft - needs assessor review)",
              level4: "Exemplary safety hygiene, inspects PPE condition, advises nearby personnel on hazard boundaries (draft - needs assessor review)",
            },
          },
          {
            code: "PC7.2",
            description: "Isolate circuit breaker and verify dead electrical circuit with calibrated voltage tester before contact",
            assessableFromVideo: "yes",
            requiresPhysical: false,
            weight: 3.0,
            rubric: {
              level1: "Touches conductors without isolating breaker or checking for live voltage (draft - needs assessor review)",
              level2: "Switches off breaker but does not apply warning tag; assumes circuit is dead without testing (draft - needs assessor review)",
              level3: "Switches off breaker, tags board, and tests with two-pole tester (Phase-Neutral, Phase-Earth, Neutral-Earth) (draft - needs assessor review)",
              level4: "Demonstrates 3-step test verification (test on known live source -> test isolated circuit -> re-test on known live source) (draft - needs assessor review)",
            },
          },
        ],
      },
    ];

    for (const nos of officialNosData) {
      const nosRes = await client.query(`
        INSERT INTO nos (
          qualification_id,
          code,
          title,
          is_core,
          theory_marks,
          practical_marks,
          source_url,
          verified
        ) VALUES ($1, $2, $3, $4, 20, 80, $5, $6)
        ON CONFLICT (qualification_id, code) DO UPDATE SET
          title = EXCLUDED.title,
          is_core = EXCLUDED.is_core,
          source_url = EXCLUDED.source_url,
          verified = EXCLUDED.verified
        RETURNING id;
      `, [qpId, nos.code, nos.title, nos.isCore, nos.sourceUrl, nos.verified]);
      const nosId = nosRes.rows[0].id;

      for (const crit of nos.criteria) {
        await client.query(`
          INSERT INTO nos_criteria (
            nos_id,
            criterion_code,
            description,
            assessable_from_video,
            requires_physical,
            weight,
            rubric_level_1,
            rubric_level_2,
            rubric_level_3,
            rubric_level_4,
            verified,
            status_label
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, 'draft - needs assessor review')
          ON CONFLICT (nos_id, criterion_code) DO UPDATE SET
            description = EXCLUDED.description,
            assessable_from_video = EXCLUDED.assessable_from_video,
            requires_physical = EXCLUDED.requires_physical,
            weight = EXCLUDED.weight,
            rubric_level_1 = EXCLUDED.rubric_level_1,
            rubric_level_2 = EXCLUDED.rubric_level_2,
            rubric_level_3 = EXCLUDED.rubric_level_3,
            rubric_level_4 = EXCLUDED.rubric_level_4,
            verified = false,
            status_label = 'draft - needs assessor review';
        `, [
          nosId,
          crit.code,
          crit.description,
          crit.assessableFromVideo,
          crit.requiresPhysical,
          crit.weight,
          crit.rubric.level1,
          crit.rubric.level2,
          crit.rubric.level3,
          crit.rubric.level4,
        ]);
      }
    }

    // 5. Seed Vernacular Trade Terms (All marked verified: false, authored draft)
    const slangTerms = [
      { v: "झिरी काटना (Jhiri katna)", e: "Conduit wall chasing / cutting grooves in masonry brickwork" },
      { v: "तार छीलना (Taar chheelna)", e: "Wire stripping & PVC insulation peeling" },
      { v: "पट्टी मारना (Patti marna)", e: "Surface casing and capping conduit installation" },
      { v: "बोर्ड कसना / लगाना (Board kasna)", e: "Modular switchboard & back-box flush mounting" },
      { v: "अर्थिंग देना (Earthing dena)", e: "Grounding conductor termination & electrode bonding" },
      { v: "MCB बैठाना / ट्रिप चेक (MCB baithana)", e: "DIN-rail breaker mounting & trip mechanism testing" },
      { v: "टेस्टर सटाना / फेज देखना (Phase dekhna)", e: "Voltage presence verification & phase polarity detection" },
      { v: "थिम्बल मारना / क्रिम्प करना (Thimble marna)", e: "Cable lug / ferrule compression crimping" },
      { v: "फिश टेप खींचना / तार दौड़ाना (Taar daudana)", e: "Fish tape pulling & cable drawing through conduit pipe" },
    ];

    for (const term of slangTerms) {
      await client.query(`
        INSERT INTO trade_terms (
          qualification_id,
          vernacular_term,
          standard_english_task,
          language,
          verified,
          status_label
        ) VALUES ($1, $2, $3, 'hi', false, 'draft - needs assessor review')
        ON CONFLICT (qualification_id, vernacular_term) DO UPDATE SET
          standard_english_task = EXCLUDED.standard_english_task,
          verified = false,
          status_label = 'draft - needs assessor review';
      `, [qpId, term.v, term.e]);
    }

    // 5b. Seed Practical Task Templates for CON/Q0602 (Authored drafts)
    const taskTemplates = [
      {
        title: "Hand Tool Safety & 1000V Insulation Check",
        nosCode: "CON/N0602",
        description: "Demonstrate pre-use defect inspection of 1000V VDE insulated hand tools, pliers, and wire strippers with challenge response.",
        instructions_hi: "कैमरे के सामने अपने 1000V इंसुलेटेड प्लायर या पेचकस को दिखाएं और स्क्रीन पर दिए गए 4-अंकों के वन-टाइम कोड को बोलकर दिखाएं।",
        instructions_en: "Inspect your 1000V VDE insulated pliers or screwdriver on camera, pointing to the voltage rating while displaying the one-time code.",
        challenge_type: "code_on_camera",
        duration_seconds: 120,
        variants: [
          { variantId: "V1", prompt: "Show the 1000V insulation stamp on combination pliers and state the security code.", kind: "code_on_camera" },
          { variantId: "V2", prompt: "Perform wire stripper calibration and recite the challenge safety phrase.", kind: "spoken_phrase" },
        ],
      },
      {
        title: "Conduit Wire Drawing with Steel Fish Tape",
        nosCode: "CON/N0604",
        description: "Demonstrate smooth wire drawing through conduit pipe using lubricated steel fish tape without jacket abrasion.",
        instructions_hi: "स्टील फिश टेप से तार खींचने की प्रक्रिया दिखाएं। दिए गए सीक्वेंस के अनुसार पहले वायर बंडल और फिर जंक्शन बॉक्स दिखाएं।",
        instructions_en: "Feed copper PVC wires through conduit with fish tape in the randomised sequence shown on screen.",
        challenge_type: "sequence_prompt",
        duration_seconds: 180,
        variants: [
          { variantId: "V1", prompt: "First show fish tape entry, then show Red/Black conductor bundle with code.", kind: "sequence_prompt" },
          { variantId: "V2", prompt: "Demonstrate wire loop slack at junction box and confirm security code.", kind: "task_variant" },
        ],
      },
      {
        title: "DIN-Rail MCB Assembly and Earth Busbar Connection",
        nosCode: "CON/N0605",
        description: "Mount a miniature circuit breaker (MCB) on standard DIN rail and securely terminate protective earth (PE) conductor.",
        instructions_hi: "पैनल में डीआईएन रेल पर एमसीबी बैठाएं और अर्थिंग बसबार से ग्रीन-येलो अर्थ वायर टाइट करके चैलेंज कोड दिखाएं।",
        instructions_en: "Snap the MCB onto DIN-rail and bolt green protective earth wire to chassis bar while displaying the challenge code.",
        challenge_type: "code_on_camera",
        duration_seconds: 180,
        variants: [
          { variantId: "V1", prompt: "Snap MCB on DIN rail, torque main terminal, and display verification nonce on camera.", kind: "code_on_camera" },
          { variantId: "V2", prompt: "Bolt green PE earth conductor to earth bar, recite safety phrase in Hindi/English.", kind: "spoken_phrase" },
        ],
      },
    ];

    for (const task of taskTemplates) {
      await client.query(`
        INSERT INTO tasks (
          qualification_id,
          title,
          nos_code,
          description,
          instructions_hi,
          instructions_en,
          challenge_type,
          duration_seconds,
          variants,
          verified,
          status_label
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::challenge_kind, $8, $9, false, 'draft - needs assessor review')
        ON CONFLICT (qualification_id, title) DO UPDATE SET
          nos_code = EXCLUDED.nos_code,
          description = EXCLUDED.description,
          instructions_hi = EXCLUDED.instructions_hi,
          instructions_en = EXCLUDED.instructions_en,
          challenge_type = EXCLUDED.challenge_type,
          duration_seconds = EXCLUDED.duration_seconds,
          variants = EXCLUDED.variants,
          verified = false,
          status_label = 'draft - needs assessor review';
      `, [
        qpId,
        task.title,
        task.nosCode,
        task.description,
        task.instructions_hi,
        task.instructions_en,
        task.challenge_type,
        task.duration_seconds,
        JSON.stringify(task.variants),
      ]);
    }

    // 6. Seed Demo User Profiles (With is_synthetic = true)
    const demoProfiles = [
      { id: "11111111-1111-1111-1111-111111111111", name: "Ramesh Sharma", role: "worker", phone: "+91 98765 43210", email: "ramesh@synthetic-worker.in" },
      { id: "22222222-2222-2222-2222-222222222222", name: "Er. Sunita Verma", role: "assessor", phone: "+91 98765 43211", email: "sunita.verma@csdci-assessor.org.in" },
      { id: "33333333-3333-3333-3333-333333333333", name: "Dr. Arvind Rao", role: "auditor", phone: "+91 98765 43212", email: "arvind.rao@ncvet-audit.gov.in" },
      { id: "44444444-4444-4444-4444-444444444444", name: "Platform Admin", role: "admin", phone: "+91 98765 43213", email: "admin@satyarpl.gov.in" },
      { id: "55555555-5555-5555-5555-555555555555", name: "Er. Vikramaditya Singh", role: "assessor", phone: "+91 98765 43214", email: "vikramaditya@uncalibrated-assessor.org.in" },
      { id: "66666666-6666-6666-6666-666666666666", name: "Anita Devi", role: "worker", phone: "+91 98765 43215", email: "anita@synthetic-worker.in" },
    ];

    for (const p of demoProfiles) {
      await client.query(`
        INSERT INTO profiles (id, full_name, role, phone, email, is_synthetic)
        VALUES ($1, $2, $3, $4, $5, true)
        ON CONFLICT (id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role,
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          is_synthetic = true;
      `, [p.id, p.name, p.role, p.phone, p.email]);
    }

    // 7. Seed Candidates (Ramesh Sharma & Anita Devi)
    const cand1Res = await client.query(`
      INSERT INTO candidates (id, profile_id, qualification_id, aadhaar_masked, assigned_assessor_id, state, district, is_synthetic)
      VALUES (
        'b0000000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        $1,
        'XXXX-XXXX-4819',
        '22222222-2222-2222-2222-222222222222',
        'Uttar Pradesh',
        'Lucknow',
        true
      )
      ON CONFLICT (id) DO UPDATE SET
        assigned_assessor_id = EXCLUDED.assigned_assessor_id,
        is_synthetic = true
      RETURNING id;
    `, [qpId]);
    const candidate1Id = cand1Res.rows[0].id;

    await client.query(`
      INSERT INTO candidates (id, profile_id, qualification_id, aadhaar_masked, assigned_assessor_id, state, district, is_synthetic)
      VALUES (
        'b0000000-0000-0000-0000-000000000002',
        '66666666-6666-6666-6666-666666666666',
        $1,
        'XXXX-XXXX-9124',
        '22222222-2222-2222-2222-222222222222',
        'Uttar Pradesh',
        'Varanasi',
        true
      )
      ON CONFLICT (id) DO NOTHING;
    `, [qpId]);

    // 8. Seed Assessment Session for Ramesh Sharma
    const sessRes = await client.query(`
      INSERT INTO assessment_sessions (id, candidate_id, assessor_id, status, is_synthetic)
      VALUES (
        'a0000000-0000-0000-0000-000000000001',
        $1,
        '22222222-2222-2222-2222-222222222222',
        'in_progress',
        true
      )
      ON CONFLICT (id) DO UPDATE SET
        status = 'in_progress',
        assessor_id = EXCLUDED.assessor_id,
        is_synthetic = true
      RETURNING id;
    `, [candidate1Id]);
    const sessionId = sessRes.rows[0].id;

    // 9. Seed Gold Standard Clips for Calibration
    const criteriaRes = await client.query(`
      SELECT id, criterion_code, assessable_from_video, requires_physical, description
      FROM nos_criteria
      WHERE nos_id IN (SELECT id FROM nos WHERE qualification_id = $1)
      ORDER BY criterion_code ASC;
    `, [qpId]);
    const allCriteria = criteriaRes.rows;

    const goldScores1 = allCriteria.slice(0, 5).map((c, idx) => ({
      criterion_id: c.id,
      criterion_code: c.criterion_code,
      expert_level: (idx % 2 === 0) ? 3 : 4,
      expert_name: "Er. R. K. Mishra (Senior Master Trainer)",
      notes: "Master demonstration: proper PPE donning and single-pull conduit execution.",
    }));

    const goldScores2 = allCriteria.slice(5, 10).map((c, idx) => ({
      criterion_id: c.id,
      criterion_code: c.criterion_code,
      expert_level: (idx % 2 === 0) ? 2 : 3,
      expert_name: "Er. R. K. Mishra (Senior Master Trainer)",
      notes: "Acceptable conduit curvature with minor cosmetic cable fray.",
    }));

    await client.query(`
      INSERT INTO gold_standard_clips (id, qualification_id, title, clip_ref, source, expert_name, criterion_scores, synthetic)
      VALUES 
      (
        'd0000000-0000-0000-0000-000000000001',
        $1,
        'Gold Clip 1: Conduit Wire Pulling & 1000V Tool Technique (Master Benchmark)',
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        'CSDCI Master Assessor Benchmark Workshop 2025',
        'Er. R. K. Mishra (Senior Master Trainer)',
        $2,
        true
      ),
      (
        'd0000000-0000-0000-0000-000000000002',
        $1,
        'Gold Clip 2: Distribution Board MCB / RCCB Termination & Busbar Mounting',
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
        'CSDCI Master Assessor Benchmark Workshop 2025',
        'Er. R. K. Mishra (Senior Master Trainer)',
        $3,
        true
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        clip_ref = EXCLUDED.clip_ref,
        criterion_scores = EXCLUDED.criterion_scores,
        synthetic = true;
    `, [qpId, JSON.stringify(goldScores1), JSON.stringify(goldScores2)]);

    // 10. Seed Assessor Calibration Records
    // Er. Sunita Verma: Certified (kappa = 0.842 > 0.70 threshold, valid for 30 days)
    await client.query(`
      INSERT INTO assessor_calibration (
        id, assessor_id, gold_clip_id, criterion_id, assessor_score, gold_score, weighted_kappa, passed, threshold, certified_until
      ) VALUES (
        'c0000000-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222',
        'd0000000-0000-0000-0000-000000000001',
        $1,
        3, 3, 0.8421, true, 0.7000,
        NOW() + INTERVAL '30 days'
      )
      ON CONFLICT (id) DO UPDATE SET
        weighted_kappa = EXCLUDED.weighted_kappa,
        passed = true,
        certified_until = NOW() + INTERVAL '30 days';
    `, [allCriteria[0]?.id || "00000000-0000-0000-0000-000000000000"]);

    // Er. Vikramaditya Singh: Expired & Below Threshold (kappa = 0.52 < 0.70, expired 5 days ago)
    await client.query(`
      INSERT INTO assessor_calibration (
        id, assessor_id, gold_clip_id, criterion_id, assessor_score, gold_score, weighted_kappa, passed, threshold, certified_until
      ) VALUES (
        'c0000000-0000-0000-0000-000000000002',
        '55555555-5555-5555-5555-555555555555',
        'd0000000-0000-0000-0000-000000000001',
        $1,
        2, 4, 0.5200, false, 0.7000,
        NOW() - INTERVAL '5 days'
      )
      ON CONFLICT (id) DO UPDATE SET
        weighted_kappa = EXCLUDED.weighted_kappa,
        passed = false,
        certified_until = NOW() - INTERVAL '5 days';
    `, [allCriteria[0]?.id || "00000000-0000-0000-0000-000000000000"]);

    // 11. Seed Evidence Item for Ramesh Sharma's Session (Video player link)
    const taskRes = await client.query("SELECT id FROM tasks WHERE qualification_id = $1 LIMIT 1", [qpId]);
    const sampleTaskId = taskRes.rows[0]?.id;

    if (sampleTaskId) {
      await client.query(`
        INSERT INTO evidence_items (
          id, session_id, task_id, blob_ref, sha256, prev_hash, chain_index,
          server_received_at, device_captured_at, latitude, longitude, accuracy_meters,
          device_fingerprint, liveness_result, sealed_at
        ) VALUES (
          'e0000000-0000-0000-0000-000000000001',
          $1, $2,
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          '8392019485720194857201948572019485720194857201948572019485720194',
          '0000000000000000000000000000000000000000000000000000000000000000',
          0, NOW(), NOW() - INTERVAL '5 minutes', 26.8467, 80.9462, 5.0,
          'synthetic-device-fingerprint', 'verified', NOW()
        )
        ON CONFLICT (id) DO NOTHING;
      `, [sessionId, sampleTaskId]);
    }

    // 12. Seed AI Suggestions for Criteria in this Session
    for (const crit of allCriteria) {
      const isVideoAssessable = crit.assessable_from_video === 'yes' && !crit.requires_physical;

      if (isVideoAssessable) {
        await client.query(`
          INSERT INTO ai_suggestions (
            session_id, criterion_id, suggested_level, confidence, observed_evidence_refs, abstained, abstain_reason
          ) VALUES ($1, $2, 3, 0.880, $3, false, null)
          ON CONFLICT (session_id, criterion_id) DO UPDATE SET
            suggested_level = 3,
            confidence = 0.880,
            observed_evidence_refs = EXCLUDED.observed_evidence_refs,
            abstained = false,
            abstain_reason = null;
        `, [
          sessionId,
          crit.id,
          JSON.stringify([
            { timestamp: "00:14", note: "Worker selected 1000V VDE insulated combination pliers with proper grip." },
            { timestamp: "01:05", note: "Fish tape pulled smoothly through 25mm PVC conduit without kinking." },
          ]),
        ]);
      } else {
        // Must ALWAYS abstain and route to physical checklist!
        await client.query(`
          INSERT INTO ai_suggestions (
            session_id, criterion_id, suggested_level, confidence, observed_evidence_refs, abstained, abstain_reason
          ) VALUES ($1, $2, null, 0.000, '[]'::jsonb, true, 'needs_physical_verification')
          ON CONFLICT (session_id, criterion_id) DO UPDATE SET
            suggested_level = null,
            confidence = 0.000,
            abstained = true,
            abstain_reason = 'needs_physical_verification';
        `, [sessionId, crit.id]);
      }
    }

    // 12. Seed Session 2 & 3 for Controlled Comparison Experiment (A vs B)
    const sess2Res = await client.query(`
      INSERT INTO assessment_sessions (id, candidate_id, assessor_id, status, is_synthetic, started_at, completed_at)
      VALUES (
        'a0000000-0000-0000-0000-000000000002',
        'b0000000-0000-0000-0000-000000000002',
        '22222222-2222-2222-2222-222222222222',
        'completed',
        true,
        NOW() - INTERVAL '2 hours',
        NOW() - INTERVAL '1 hour 45 minutes'
      )
      ON CONFLICT (id) DO UPDATE SET
        status = 'completed',
        is_synthetic = true
      RETURNING id;
    `);
    const session2Id = sess2Res.rows[0].id;

    const sess3Res = await client.query(`
      INSERT INTO assessment_sessions (id, candidate_id, assessor_id, status, is_synthetic, started_at, completed_at)
      VALUES (
        'a0000000-0000-0000-0000-000000000003',
        'b0000000-0000-0000-0000-000000000002',
        '22222222-2222-2222-2222-222222222222',
        'completed',
        true,
        NOW() - INTERVAL '1 hour',
        NOW() - INTERVAL '40 minutes'
      )
      ON CONFLICT (id) DO UPDATE SET
        status = 'completed',
        is_synthetic = true
      RETURNING id;
    `);
    const session3Id = sess3Res.rows[0].id;

    // 13. Seed Paired Scores for Controlled Comparison (Condition A vs Condition B)
    // Assessor 1: Er. Sunita Verma ('22222222-...')
    // Assessor 2: Er. Vikramaditya Singh ('55555555-...')
    const a1 = '22222222-2222-2222-2222-222222222222';
    const a2 = '55555555-5555-5555-5555-555555555555';

    // Condition B (Assisted: high consensus with rubric anchors on session 3)
    for (let i = 0; i < Math.min(8, allCriteria.length); i++) {
      const crit = allCriteria[i];
      const level1 = (i % 3 === 0) ? 3 : (i % 3 === 1) ? 2 : 4;
      const level2 = (i % 4 === 0) ? (level1 === 4 ? 3 : level1 + 1) : level1; // High agreement

      await client.query(`
        INSERT INTO scores (session_id, assessor_id, criterion_id, level, rationale, is_blind, condition, scoring_duration_seconds)
        VALUES ($1, $2, $3, $4, 'Systematic verification adhering to IS 732 standard.', true, 'B', 240)
        ON CONFLICT (session_id, assessor_id, criterion_id, is_blind) DO NOTHING;
      `, [session3Id, a1, crit.id, level1]);

      await client.query(`
        INSERT INTO scores (session_id, assessor_id, criterion_id, level, rationale, is_blind, condition, scoring_duration_seconds)
        VALUES ($1, $2, $3, $4, 'Concur with benchmark observations under assisted review.', true, 'B', 210)
        ON CONFLICT (session_id, assessor_id, criterion_id, is_blind) DO NOTHING;
      `, [session3Id, a2, crit.id, level2]);
    }

    // Condition A (Unassisted baseline: moderate agreement on session 2)
    for (let i = 0; i < Math.min(8, allCriteria.length); i++) {
      const crit = allCriteria[i];
      const levelA1 = (i % 2 === 0) ? 3 : 2;
      const levelA2 = (i % 2 === 0) ? 2 : 3; // Disagreement on baseline

      await client.query(`
        INSERT INTO scores (session_id, assessor_id, criterion_id, level, rationale, is_blind, condition, scoring_duration_seconds)
        VALUES ($1, $2, $3, $4, 'Unassisted manual observation without rubric anchor guide.', true, 'A', 95)
        ON CONFLICT (session_id, assessor_id, criterion_id, is_blind) DO NOTHING;
      `, [session2Id, a1, crit.id, levelA1]);

      await client.query(`
        INSERT INTO scores (session_id, assessor_id, criterion_id, level, rationale, is_blind, condition, scoring_duration_seconds)
        VALUES ($1, $2, $3, $4, 'Independent unassisted evaluation.', true, 'A', 80)
        ON CONFLICT (session_id, assessor_id, criterion_id, is_blind) DO NOTHING;
      `, [session2Id, a2, crit.id, levelA2]);
    }

    // 14. Seed Assessor Anomalies (Explainable statistical rules)
    await client.query(`
      INSERT INTO assessor_anomalies (
        id, assessor_id, session_id, rule_code, severity, description, metrics
      ) VALUES 
      (
        'e0000000-0000-0000-0000-000000000001',
        '55555555-5555-5555-5555-555555555555',
        'a0000000-0000-0000-0000-000000000002',
        'SPEED_SCORING',
        'high',
        'Practical session evaluated in 95 seconds (threshold: < 180s). Unlikely to allow thorough inspection of conduit and wiring.',
        '{"durationSeconds": 95, "thresholdSeconds": 180}'::jsonb
      ),
      (
        'e0000000-0000-0000-0000-000000000002',
        '55555555-5555-5555-5555-555555555555',
        'a0000000-0000-0000-0000-000000000002',
        'STRAIGHT_LINING',
        'medium',
        'Assessor assigned identical Level 3 across 7 consecutive criteria without differentiation.',
        '{"totalCriteria": 7, "distinctLevels": 1, "invariantLevel": 3}'::jsonb
      ),
      (
        'e0000000-0000-0000-0000-000000000003',
        '22222222-2222-2222-2222-222222222222',
        null,
        'LENIENCY_ZSCORE',
        'medium',
        'Assessor mean score (3.78) deviates from state peer mean (2.85) by z = +2.34 (threshold: |z| >= 2.0). Review prompt for lenient calibration.',
        '{"zScore": 2.34, "assessorMean": 3.78, "populationMean": 2.85, "threshold": 2.0}'::jsonb
      )
      ON CONFLICT (id) DO NOTHING;
    `);

    // 15. Seed Evidence Integrity Flags
    const evidenceRes = await client.query("SELECT id FROM evidence_items LIMIT 1;");
    if (evidenceRes.rows.length > 0) {
      const evId = evidenceRes.rows[0].id;
      await client.query(`
        INSERT INTO evidence_flags (id, evidence_id, type, severity, details)
        VALUES 
        (
          'f0000000-0000-0000-0000-000000000001',
          $1,
          'reuse',
          'critical',
          '{"matchedCandidate": "XXXX-XXXX-9124", "hammingDistance": 2, "threshold": 5, "description": "High perceptual visual hash similarity with previously submitted video in Gorakhpur district."}'::jsonb
        ),
        (
          'f0000000-0000-0000-0000-000000000002',
          $1,
          'clock_skew',
          'medium',
          '{"skewSeconds": 142, "thresholdSeconds": 60, "clientTimestamp": "2026-10-10T14:22:10Z", "serverTimestamp": "2026-10-10T14:24:32Z"}'::jsonb
        )
        ON CONFLICT (id) DO NOTHING;
      `, [evId]);
    }

    await client.query("COMMIT");

    // 7. Write an Audit Log entry for the Seed Event
    await logAuditEvent({
      entityName: "QUALIFICATION_SEED",
      entityId: "CON/Q0602",
      action: "CREATE",
      actorRole: "system",
      afterState: { qp_code: "CON/Q0602", nos_count: officialNosData.length, slang_count: slangTerms.length },
      metadata: { provenance: "https://www.nqr.gov.in/qualifications/13772", nqr_code: "QG-03-CO-03951-2025-V2-CSDCI" },
    });

    return { success: true, qpCode: "CON/Q0602", nosCount: officialNosData.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
