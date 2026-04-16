import type { APIRequestContext } from "@playwright/test";
import fs from "fs";
import path from "path";

const API = "/api/v1";

export type SeedUser = { id: string; email: string; password: string; token: string; fullName: string; user: any };
export type SeedProject = { id: string; name: string };
export type SeedTask = { id: string; title: string; deliverableId?: string };

export type SeedResult = {
  tenantSlug: string;
  owner: SeedUser;
  supervisor: SeedUser;
  helper: SeedUser;
  client: SeedUser;
  platformAdmin: SeedUser;
  project: SeedProject;
  project2: SeedProject;
  tasks: SeedTask[];
  evidences: { id: string; taskId: string }[];
};

const PASSWORD = "demo1234";

function uniqueSlug(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

async function json<T = any>(res: Response | any): Promise<T> {
  const text = await res.text();
  if (!res.ok()) {
    throw new Error(`HTTP ${res.status()} on ${res.url()}: ${text}`);
  }
  return text ? JSON.parse(text) : ({} as T);
}

export async function seedDemo(api: APIRequestContext, opts: { platformAdminEmail: string; platformAdminPassword: string }): Promise<SeedResult> {
  const tenantSlug = uniqueSlug("course-demo");
  const ownerEmail = `${tenantSlug}+owner@demo.pp`;

  // 1. Register owner (creates tenant)
  const regRes = await api.post(`${API}/auth/register`, {
    data: {
      company_name: "Demo Constructora",
      company_slug: tenantSlug,
      owner_name: "Olivia Owner",
      owner_email: ownerEmail,
      password: PASSWORD,
    },
  });
  const reg = await json<any>(regRes);
  const owner: SeedUser = {
    id: reg.user.id,
    email: ownerEmail,
    password: PASSWORD,
    token: reg.access_token,
    fullName: "Olivia Owner",
    user: reg.user,
  };

  const ownerAuth = { Authorization: `Bearer ${owner.token}` };

  // 2. Create supervisor, helper, client
  const createUser = async (fullName: string, email: string, role: string): Promise<SeedUser> => {
    const res = await api.post(`${API}/users`, {
      headers: ownerAuth,
      data: { full_name: fullName, email, password: PASSWORD, role },
    });
    const body = await json<any>(res);
    const loginRes = await api.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
    const loginBody = await json<any>(loginRes);
    return { id: body.id, email, password: PASSWORD, token: loginBody.access_token, fullName, user: loginBody.user };
  };

  const supervisor = await createUser("Santiago Supervisor", `${tenantSlug}+sup@demo.pp`, "supervisor");
  const helper = await createUser("Hugo Helper", `${tenantSlug}+help@demo.pp`, "helper");
  const client = await createUser("Carla Client", `${tenantSlug}+client@demo.pp`, "client");

  // 3. Create project
  const p1Res = await api.post(`${API}/projects`, {
    headers: ownerAuth,
    data: {
      name: "Residencial Vista Norte",
      description: "Torre residencial de 12 niveles en Polanco.",
      supervisor_user_id: supervisor.id,
      client_user_id: client.id,
      budget_total_cents: 120_000_00,
      spent_total_cents: 30_000_00,
      start_date: "2026-04-01",
      planned_end_date: "2026-06-15",
      latitude_center: 19.4326,
      longitude_center: -99.1332,
      geofence_radius_m: 150,
    },
  });
  const p1 = await json<any>(p1Res);

  // p2 is optional — Starter plan only allows 1 active project
  let p2: any = { id: p1.id, name: p1.name };
  try {
    const p2Res = await api.post(`${API}/projects`, {
      headers: ownerAuth,
      data: {
        name: "Oficinas Polanco",
        description: "Remodelación de oficinas corporativas.",
        supervisor_user_id: supervisor.id,
        client_user_id: client.id,
        budget_total_cents: 80_000_00,
        spent_total_cents: 0,
        start_date: "2026-05-01",
        planned_end_date: "2026-07-30",
        latitude_center: 19.4326,
        longitude_center: -99.1332,
        geofence_radius_m: 100,
      },
    });
    if (p2Res.ok()) p2 = await json<any>(p2Res);
  } catch {}

  // 4. Tasks with deliverables
  const tasks: SeedTask[] = [];
  for (const t of [
    {
      title: "Instalación de lobby",
      desc: "Acabado principal",
      spec: "Mármol Carrara uniforme, junta 2mm, sin desportilladuras.",
      deliverable: "Entrega de Lobby",
    },
    {
      title: "Acabado de muros nivel 3",
      desc: "Pintura y detalles",
      spec: "Dos manos de pintura esmalte, sin escurrimientos.",
      deliverable: "Entrega de Muros N3",
    },
    {
      title: "Instalación eléctrica",
      desc: "Cableado principal",
      spec: "Cable calibre 10 en toda la planta, pruebas de continuidad.",
      deliverable: "Entrega Eléctrica",
    },
  ]) {
    const res = await api.post(`${API}/projects/${p1.id}/tasks`, {
      headers: ownerAuth,
      data: {
        task: {
          title: t.title,
          description: t.desc,
          assigned_to_user_id: helper.id,
          status: "pending",
          start_date: "2026-04-02",
          end_date: "2026-04-18",
          expected_finish_quality: t.spec,
          technical_spec_text: t.spec,
          budget_cents: 35_000_00,
          spent_cents: 11_000_00,
          progress_percent: 20,
        },
        deliverable: {
          title: t.deliverable,
          description: t.desc,
          due_date: "2026-04-18",
        },
      },
    });
    const body = await json<any>(res);
    tasks.push({ id: body.task.id, title: t.title, deliverableId: body.deliverable?.id });
  }

  // 5. Upload evidence as helper on task[0]
  const helperAuth = { Authorization: `Bearer ${helper.token}` };
  const evidences: { id: string; taskId: string }[] = [];

  const sampleJpg = path.join(__dirname, "assets", "sample-1.jpg");
  if (!fs.existsSync(sampleJpg)) {
    // Create a tiny placeholder JPG if asset is missing — keeps the seed functional.
    fs.mkdirSync(path.dirname(sampleJpg), { recursive: true });
    const stub = Buffer.from(
      "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b08000100010101011100ffc400150100010000000000000000000000000000000000ffc4001f1000010501010101010100000000000000000102030405060708090a0b02010002030101010101010000000000000000010203040506070809ffc40014110100000000000000000000000000000000ffc40014110100000000000000000000000000000000ffda000c03010002110311003f00bf00ffd9",
      "hex",
    );
    fs.writeFileSync(sampleJpg, stub);
  }

  const fileBytes = fs.readFileSync(sampleJpg);
  const firstTask = tasks[0];
  const uploadReq = await api.post(`${API}/tasks/${firstTask.id}/evidence/upload-url`, {
    headers: helperAuth,
    data: {
      file_name: "sample-1.jpg",
      content_type: "image/jpeg",
      file_size_bytes: fileBytes.byteLength,
      latitude: 19.4326,
      longitude: -99.1332,
      project_id: p1.id,
    },
  });
  const uploadBody = await json<any>(uploadReq);

  // PUT the file bytes to the signed upload URL
  const uploadUrl: string = uploadBody.upload_url ?? uploadBody.url ?? uploadBody.uploadUrl;
  const sessionId: string = uploadBody.session_id ?? uploadBody.sessionId ?? uploadBody.id;

  const putRes = await api.put(uploadUrl, {
    headers: { "Content-Type": "image/jpeg" },
    data: fileBytes,
  });
  if (!putRes.ok()) throw new Error(`upload PUT failed: ${putRes.status()}`);

  const confirmRes = await api.post(`${API}/evidence/confirm-upload`, {
    headers: helperAuth,
    data: { upload_session_id: sessionId },
  });
  const confirmBody = await json<any>(confirmRes);
  evidences.push({ id: confirmBody.id ?? confirmBody.evidence_id ?? sessionId, taskId: firstTask.id });

  // 6. Supervisor approves the evidence
  const supAuth = { Authorization: `Bearer ${supervisor.token}` };
  await api.post(`${API}/evidences/${evidences[0].id}/approve`, {
    headers: supAuth,
    data: { comment: "Se ve impecable, aprobada.", visible_to_client: true },
  });

  // 7. Approve one deliverable (the one tied to task[0])
  if (firstTask.deliverableId) {
    await api.post(`${API}/deliverables/${firstTask.deliverableId}/approve`, {
      headers: { Authorization: `Bearer ${client.token}` },
      data: { comment: "Todo en orden." },
    });
  }

  // 8. Send a message in the hub
  await api.post(`${API}/projects/${p1.id}/messages`, {
    headers: ownerAuth,
    data: { body: "Recuerden enviar evidencia al final del turno." },
  });

  // 9. Budget adjustment
  await api.post(`${API}/projects/${p1.id}/budget-adjustments`, {
    headers: ownerAuth,
    data: { amount_cents: 500_000, reason: "Imprevistos de obra", adjustment_type: "increase" },
  });

  // 10. Platform admin login
  const adminLoginRes = await api.post(`${API}/auth/login`, {
    data: { email: opts.platformAdminEmail, password: opts.platformAdminPassword },
  });
  const adminLogin = await json<any>(adminLoginRes);
  const platformAdmin: SeedUser = {
    id: adminLogin.user?.id ?? "platform-admin",
    email: opts.platformAdminEmail,
    password: opts.platformAdminPassword,
    token: adminLogin.access_token,
    fullName: "Platform Admin",
    user: adminLogin.user,
  };

  return {
    tenantSlug,
    owner,
    supervisor,
    helper,
    client,
    platformAdmin,
    project: { id: p1.id, name: p1.name },
    project2: { id: p2.id, name: p2.name },
    tasks,
    evidences,
  };
}
