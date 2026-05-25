import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, CloseButton, Dialog, Portal } from "@chakra-ui/react";
import "./landingPage.css";

import psatLogo2 from "./assets/PSAT Logo 2.png";
import cyclerapLogo from "./assets/CycleRAP-logo.png";
import { APP_META } from "../../appMeta";
import { toaster } from "../../components/ui/toaster";
import { useProfile } from "../../features/profile/ProfileProvider";

export default function LandingPage() {
  const navigate = useNavigate();
  const {
    profiles,
    activeProfile,
    loading,
    error,
    createProfile,
    login,
  } = useProfile();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [loginPin, setLoginPin] = useState("");
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileDivision, setNewProfileDivision] = useState("");
  const [newProfilePin, setNewProfilePin] = useState("");
  const [busyAction, setBusyAction] = useState<"login" | "create" | null>(null);

  useEffect(() => {
    if (selectedProfileId && profiles.some((profile) => profile.id === selectedProfileId)) {
      return;
    }
    if (activeProfile && profiles.some((profile) => profile.id === activeProfile.id)) {
      setSelectedProfileId(activeProfile.id);
      return;
    }
    if (profiles.length > 0) {
      setSelectedProfileId(profiles[0].id);
      return;
    }
    setSelectedProfileId(null);
  }, [activeProfile, profiles, selectedProfileId]);

  useEffect(() => {
    setLoginPin("");
  }, [selectedProfileId]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const canOpenFirstProfileSetup = profiles.length === 0 && busyAction === null && !loading;
  const canEnterSelectedProfile = Boolean(
    selectedProfile && activeProfile && activeProfile.id === selectedProfile.id && busyAction === null && !loading,
  );
  const canUseStartButton = Boolean((selectedProfile || canOpenFirstProfileSetup) && busyAction === null && !loading);
  const startButtonLabel = selectedProfile
    ? `START AS ${selectedProfile.name}`
    : profiles.length === 0
      ? "CREATE FIRST PROFILE"
      : "SELECT A PROFILE";

  const openPinDialog = () => {
    setLoginPin("");
    setPinDialogOpen(true);
  };

  const closePinDialog = () => {
    setPinDialogOpen(false);
    setLoginPin("");
  };

  const openCreateDialog = () => {
    setCreateDialogOpen(true);
  };

  const closeCreateDialog = () => {
    if (busyAction === "create") {
      return;
    }
    setCreateDialogOpen(false);
    setNewProfileName("");
    setNewProfileDivision("");
    setNewProfilePin("");
  };

  const startPSAT = () => {
    if (canEnterSelectedProfile) {
      navigate("/home");
      return;
    }

    if (canOpenFirstProfileSetup) {
      openCreateDialog();
      return;
    }

    if (selectedProfile && busyAction === null) {
      openPinDialog();
    }
  };

  const handleLogin = async () => {
    if (!selectedProfile) {
      toaster.create({ description: "Select a profile first.", type: "warning" });
      return;
    }
    try {
      setBusyAction("login");
      await login(selectedProfile.id, loginPin);
      closePinDialog();
      toaster.create({
        title: "Profile ready",
        description: `Logged in as ${selectedProfile.name}.`,
        type: "success",
      });
      navigate("/home");
    } catch (nextError) {
      toaster.create({
        title: "Login failed",
        description: nextError instanceof Error ? nextError.message : "Failed to log in.",
        type: "error",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreate = async () => {
    try {
      setBusyAction("create");
      const created = await createProfile(newProfileName, newProfilePin, newProfileDivision);
      await login(created.profile.id, newProfilePin);
      setSelectedProfileId(created.profile.id);
      setCreateDialogOpen(false);
      setNewProfileName("");
      setNewProfileDivision("");
      setNewProfilePin("");
      toaster.create({
        title: "Profile created",
        description: `${created.profile.name} is ready to use.`,
        type: "success",
      });
    } catch (nextError) {
      toaster.create({
        title: "Profile setup failed",
        description: nextError instanceof Error ? nextError.message : "Failed to create the profile.",
        type: "error",
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <main className="landing-root" role="main">
      {/* 右侧品牌区：logo + 文字 */}
      <aside className="right-rail" aria-label="PSAT branding">
        <img
          src={psatLogo2}
          alt="PSAT logo"
          className="psat-logo"
          loading="eager"
          decoding="async"
          draggable={false}
        />

        <h1 className="psat-logo name">path safety assessment tool</h1>

        <p className="psat-logo description">an evidence-based risk evaluation model for active mobility users</p>

        <section className="profile-panel" aria-label="Profile access">
          <div className="profile-panel-header">
            <div className="profile-panel-copy">
              <h2>Profiles</h2>
              <p>Select a local profile on this device, then start the app.</p>
            </div>

            <button
              type="button"
              className="profile-create-btn"
              onClick={openCreateDialog}
              disabled={busyAction !== null}
            >
              Create Profile
            </button>
          </div>

          {loading ? (
            <div className="profile-status">Loading profiles...</div>
          ) : (
            <>
              {error && <div className="profile-error">{error}</div>}

              <div className="profile-scroll-shell">
                {profiles.length > 0 ? (
                  <div className="profile-list">
                    {profiles.map((profile) => {
                      const isSelected = profile.id === selectedProfileId;
                      const isActive = profile.id === activeProfile?.id;
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          className={`profile-option${isSelected ? " is-selected" : ""}${isActive ? " is-active" : ""}`}
                          onClick={() => setSelectedProfileId(profile.id)}
                        >
                          <span className="profile-option-name">{profile.name}</span>
                          <span className="profile-option-meta">
                            {profile.division} • {" "}
                            {profile.project_count} project{profile.project_count === 1 ? "" : "s"}
                            {isActive ? " • current" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="profile-empty">No profiles yet. Create one to begin.</div>
                )}
              </div>
            </>
          )}
        </section>

        <button
          type="button"
          className="start-btn"
          onClick={startPSAT}
          aria-label="Start PSAT"
          disabled={!canUseStartButton}
        >
          {startButtonLabel}
        </button>
      </aside>

      <Dialog.Root open={pinDialogOpen} onOpenChange={(details) => !details.open && closePinDialog()} size="sm" unmountOnExit>
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Enter PIN</Dialog.Title>
              </Dialog.Header>

              <Dialog.Body>
                <div className="landing-dialog-copy">
                  Enter the PIN for <strong>{selectedProfile?.name ?? "the selected profile"}</strong> to continue.
                </div>
                <div className="landing-dialog-form">
                  <input
                    id="profilePin"
                    className="landing-dialog-input"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={loginPin}
                    onChange={(event) => setLoginPin(event.target.value)}
                    placeholder="PIN"
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleLogin();
                      }
                    }}
                  />
                </div>
              </Dialog.Body>

              <Dialog.Footer>
                <Button variant="outline" onClick={closePinDialog} disabled={busyAction === "login"}>
                  Cancel
                </Button>
                <Button
                  colorPalette="green"
                  onClick={() => void handleLogin()}
                  loading={busyAction === "login"}
                  disabled={loginPin.trim().length === 0 || busyAction === "login"}
                >
                  {busyAction === "login" ? "Starting..." : `Start As ${selectedProfile?.name ?? "Profile"}`}
                </Button>
              </Dialog.Footer>

              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <Dialog.Root open={createDialogOpen} onOpenChange={(details) => !details.open && closeCreateDialog()} size="sm" unmountOnExit>
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Create Profile</Dialog.Title>
              </Dialog.Header>

              <Dialog.Body>
                <div className="landing-dialog-copy">
                  Create a local profile for this device. The profile name stays readable, while the PIN is stored in obfuscated form.
                </div>
                <div className="landing-dialog-form">
                  <input
                    id="newProfileName"
                    className="landing-dialog-input"
                    type="text"
                    value={newProfileName}
                    onChange={(event) => setNewProfileName(event.target.value)}
                    placeholder="Profile name"
                    autoFocus
                  />
                  <input
                    id="newProfileDivision"
                    className="landing-dialog-input"
                    type="text"
                    value={newProfileDivision}
                    onChange={(event) => setNewProfileDivision(event.target.value)}
                    placeholder="Division"
                  />
                  <input
                    id="newProfilePin"
                    className="landing-dialog-input"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={newProfilePin}
                    onChange={(event) => setNewProfilePin(event.target.value)}
                    placeholder="4 to 12 digit PIN"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleCreate();
                      }
                    }}
                  />
                </div>
              </Dialog.Body>

              <Dialog.Footer>
                <Button variant="outline" onClick={closeCreateDialog} disabled={busyAction === "create"}>
                  Cancel
                </Button>
                <Button
                  colorPalette="green"
                  onClick={() => void handleCreate()}
                  loading={busyAction === "create"}
                  disabled={busyAction === "create" || newProfileName.trim().length === 0 || newProfileDivision.trim().length === 0 || newProfilePin.trim().length === 0}
                >
                  {busyAction === "create" ? "Creating..." : "Create Profile"}
                </Button>
              </Dialog.Footer>

              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>


      <footer className="landing-footer">
        <span className="version-info">v{APP_META.version} ({APP_META.buildDate})</span>
        <img
          src={cyclerapLogo}
          alt="CycleRAP logo"
          className="cyclerap-logo-bottom"
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      </footer>
    </main>
  );
}
