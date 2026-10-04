import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Invitation } from "../src/models/invitation.models.js";
import { API, anon, clearDb, closeDb, lastMail, makeProject, signup } from "./helpers.js";

beforeEach(clearDb);
afterAll(closeDb);

const invite = (owner, projectId, body) => owner.agent.post(`${API}/projects/${projectId}/invitations`).send(body);
const tokenOf = (url) => url.split("/").pop();

describe("email invitations", () => {
  it("invites someone with no account: email + link, listed as pending", async () => {
    const ada = await signup();
    const project = await makeProject(ada, [], "Website");
    const res = await invite(ada, project._id, { email: "New.Person@test.dev", role: "project_admin" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      emailSent: true,
      invitation: { email: "new.person@test.dev", role: "project_admin", status: "pending" },
    });
    expect(res.body.data.inviteUrl).toMatch(/^http:\/\/localhost:5173\/invite\/[\w-]{40,}$/);
    expect(lastMail("new.person@test.dev").subject).toContain("Website");

    const list = (await ada.agent.get(`${API}/projects/${project._id}/invitations`)).body.data;
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toMatch(/tokenHash/);
  });

  it("only admins can invite; members can't even list", async () => {
    const [ada, bob] = [await signup(), await signup()];
    const project = await makeProject(ada, [{ ...bob, role: "member" }]);
    expect((await invite(bob, project._id, { email: "x@test.dev" })).status).toBe(403);
    expect((await bob.agent.get(`${API}/projects/${project._id}/invitations`)).status).toBe(403);
  });

  it("refuses existing members, and re-inviting refreshes the same invitation with a new link", async () => {
    const [ada, bob] = [await signup(), await signup()];
    const project = await makeProject(ada, [{ ...bob, role: "member" }]);
    expect((await invite(ada, project._id, { email: bob.user.email })).status).toBe(409);

    const first = (await invite(ada, project._id, { email: "new@test.dev" })).body.data;
    const second = (await invite(ada, project._id, { email: "new@test.dev" })).body.data;
    expect(await Invitation.countDocuments({ status: "pending" })).toBe(1);
    expect((await anon().get(`${API}/invitations/${tokenOf(first.inviteUrl)}`)).status).toBe(404); // old link is dead
    expect((await anon().get(`${API}/invitations/${tokenOf(second.inviteUrl)}`)).status).toBe(200);
  });

  it("the public lookup shows the project, role and inviter; bad tokens 404", async () => {
    const ada = await signup({ fullName: "Ada Lovelace" });
    const project = await makeProject(ada, [], "Analytical Engine");
    const { inviteUrl } = (await invite(ada, project._id, { email: "n@test.dev" })).body.data;
    const res = await anon().get(`${API}/invitations/${tokenOf(inviteUrl)}`);
    expect(res.body.data).toEqual({
      email: "n@test.dev",
      role: "member",
      projectName: "Analytical Engine",
      invitedBy: "Ada Lovelace",
    });
    expect((await anon().get(`${API}/invitations/nonsense`)).status).toBe(404);
  });

  it("a new user signs up with the invited email and accepts: they become a member, once", async () => {
    const ada = await signup();
    const project = await makeProject(ada);
    const { inviteUrl } = (await invite(ada, project._id, { email: "guest@test.dev", role: "project_admin" })).body
      .data;
    const token = tokenOf(inviteUrl);

    const guest = await signup({ email: "guest@test.dev" });
    expect((await guest.agent.post(`${API}/invitations/${token}/accept`)).status).toBe(200);
    expect((await guest.agent.get(`${API}/projects/${project._id}`)).body.data.myRole).toBe("project_admin");
    expect((await guest.agent.get(`${API}/auth/current-user`)).body.data.isEmailVerified).toBe(true); // proved by the link
    expect((await guest.agent.post(`${API}/invitations/${token}/accept`)).status).toBe(404); // single use
    expect((await ada.agent.get(`${API}/projects/${project._id}/invitations`)).body.data).toHaveLength(0);
  });

  it("the wrong account can't accept (and sees only a masked address)", async () => {
    const ada = await signup();
    const project = await makeProject(ada);
    const { inviteUrl } = (await invite(ada, project._id, { email: "guest@test.dev" })).body.data;
    const mallory = await signup();
    const res = await mallory.agent.post(`${API}/invitations/${tokenOf(inviteUrl)}/accept`);
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("g***@test.dev");
    expect((await mallory.agent.get(`${API}/projects/${project._id}`)).status).toBe(404);
    expect((await anon().post(`${API}/invitations/${tokenOf(inviteUrl)}/accept`)).status).toBe(401);
  });

  it("revoked and expired invitations stop working; resend issues a fresh link", async () => {
    const ada = await signup();
    const project = await makeProject(ada);
    const base = `${API}/projects/${project._id}/invitations`;

    const a = (await invite(ada, project._id, { email: "a@test.dev" })).body.data;
    await ada.agent.delete(`${base}/${a.invitation._id}`).expect(200);
    expect((await anon().get(`${API}/invitations/${tokenOf(a.inviteUrl)}`)).status).toBe(404);

    const b = (await invite(ada, project._id, { email: "b@test.dev" })).body.data;
    await Invitation.updateOne({ _id: b.invitation._id }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await anon().get(`${API}/invitations/${tokenOf(b.inviteUrl)}`)).status).toBe(404);

    const resent = (await ada.agent.post(`${base}/${b.invitation._id}/resend`)).body.data;
    expect((await anon().get(`${API}/invitations/${tokenOf(resent.inviteUrl)}`)).status).toBe(200);
  });

  it("validates the email and role", async () => {
    const ada = await signup();
    const project = await makeProject(ada);
    expect((await invite(ada, project._id, { email: "not-an-email" })).status).toBe(422);
    expect((await invite(ada, project._id, { email: "a@test.dev", role: "superuser" })).status).toBe(422);
  });
});
