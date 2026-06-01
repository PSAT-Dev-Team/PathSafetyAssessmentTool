import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Text, Flex, Button } from "@chakra-ui/react";
import { useColorMode } from "../../components/ui/color-mode";
import DeveloperGuide from "./DeveloperGuide";
import UserGuide from "./UserGuide";

export default function HelpPage() {
  const navigate = useNavigate();
  const { colorMode } = useColorMode();
  const dark = colorMode === "dark";
  const [activeTab, setActiveTab] = useState<"user" | "developer" | "admin">("user");

  return (
    <Box minH="100vh" bg="gray.100" _dark={{ bg: "gray.900" }} p="8" fontFamily="inherit">
      <Box
        maxW="1000px"
        mx="auto"
        bg="white"
        _dark={{ bg: "gray.800" }}
        borderRadius="xl"
        boxShadow="lg"
        p={{ base: "6", md: "10" }}
      >
        {/* Header */}
        <Flex
          justify="space-between"
          align="center"
          borderBottom="2px solid"
          borderColor="gray.200"
          _dark={{ borderColor: "gray.600", bg: "gray.800" }}
          pb="4"
          mb="6"
          position="sticky"
          top="0"
          bg="white"
          zIndex="10"
        >
          <Text fontSize="2xl" fontWeight="bold" color="gray.800" _dark={{ color: "gray.100" }}>
            Documentation & Guides
          </Text>
          <Button size="sm" colorPalette="blue" onClick={() => navigate("/projects")}>
            Go Back
          </Button>
        </Flex>


        {/* Tabs */}
        <Flex gap="4" mb="8" borderBottom="2px solid" borderColor="gray.200" _dark={{ borderColor: "gray.600" }}>
          {(["user", "developer", "admin"] as const).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <Box
                key={tab}
                as="button"
                px="4"
                py="2"
                fontSize="md"
                fontWeight="semibold"
                color={isActive
                  ? (dark ? "white" : "gray.900")
                  : (dark ? "gray.400" : "gray.500")
                }
                position="relative"
                cursor="pointer"
                bg="transparent"
                border="none"
                outline="none"
                onClick={() => setActiveTab(tab)}
              >
                {tab === "user" ? "User Guide" : tab === "developer" ? "Developer Guide" : "Admin Guide"}
                {isActive && (
                  <Box
                    position="absolute"
                    bottom="-2px"
                    left="0"
                    right="0"
                    h="3px"
                    bg="blue.500"
                    borderRadius="3px 3px 0 0"
                  />
                )}
              </Box>
            );
          })}
        </Flex>

        {/* Content */}
        <Box>
          {activeTab === "user" && <UserGuide />}
          {activeTab === "developer" && <DeveloperGuide />}
          {activeTab === "admin" && <AdminGuide />}
        </Box>
      </Box>
    </Box>
  );
}

function AdminGuide() {
  return (
    <Box>
      <Text fontSize="xl" fontWeight="bold" color="gray.800" _dark={{ color: "gray.100" }} mb="4">
        Administrator Guide
      </Text>
      <Text color="gray.600" _dark={{ color: "gray.400" }} lineHeight="1.7" mb="6">
        This section provides instructions for system administrators on how to deploy, manage, and update the Path Safety Assessment Tool (PSAT).
      </Text>

      {[
        {
          title: "1. Deployment & Infrastructure",
          items: [
            { label: "Starting the App:", body: <>The application is typically orchestrated via Docker Compose. Run <Code>docker compose up --build</Code> to start both the Flask backend and the React frontend. For direct local launching, you can use the <Code>Run-PSAT.bat</Code> script.</> },
            { label: "Data Persistence:", body: <>User-created projects, images, and results are stored in the <Code>data/</Code> directory, which is bind-mounted to the backend. Backing up this folder will backup all user work across the system.</> },
          ],
        },
        {
          title: "2. Managing Machine Learning Models",
          items: [
            { label: "YOLO Weights:", body: <>The computer-vision prediction models are stored in <Code>backend/models/</Code>. To deploy a newly trained model, replace the existing <Code>.pt</Code> files and restart the backend container.</> },
            { label: "Hardware Configuration:", body: "The backend loads PyTorch models into memory on initialization. Ensure the host machine has adequate RAM. For GPU acceleration, CUDA drivers must be properly configured." },
          ],
        },
        {
          title: "3. Managing GIS Data Layers",
          items: [
            { label: "Storage Location:", body: <>The CycleRAP contextual GIS infrastructure shapefiles are stored under <Code>backend/shapefiles/</Code>.</> },
            { label: "Updating via UI:", body: "Administrators can now use the 'Update GIS Layer' button in the sidebar to add or replace layers. This UI handles file validation and ensures that all mandatory companion files (.shx, .dbf, etc.) are present." },
            { label: "Replacement Safety:", body: "The 'Replace GIS Layer' workflow includes a search filter for quick navigation and a compatibility check that verifies the new file's column structure against the existing layer definition." },
            { label: "Column Mapping:", body: "Ensure that any new GIS data follows the required column indices documented in the 'Gis Layers' dashboard (e.g., column index 1 for LU_DESC)." },
          ],
        },
        {
          title: "4. Troubleshooting & Health",
          items: [
            { label: "Logs:", body: <>If auto-coding fails, check the server output via <Code>docker compose logs -f backend</Code> to view full Python stack traces.</> },
            { label: "Health Endpoints:", body: <>Query <Code>/api/health</Code> or <Code>/api/ping</Code> to verify the backend is responsive and CV models loaded correctly.</> },
          ],
        },
        {
          title: "5. Updating CycleRAP Algorithm",
          items: [
            { label: "Algorithm Updates:", body: "Occasionally, CycleRAP may release an updated risk scoring model. Administrators should contact the development team to update the system to the latest algorithm version." },
            { label: "Implementation Details:", body: "The exact implementation details, required formula modifications, and testing procedures for algorithm updates can be found in the Developer Guide." },
          ],
        },
        {
          title: "6. User Accounts & Sign-In",
          items: [
            {
              label: "Overview:",
              body: "PSAT uses a local profile system. Each user creates a named profile secured by a 4–12 digit numeric PIN. Profiles and all their associated projects persist on disk — users can always sign back in on the same device to access previously saved work.",
            },
            {
              label: "How a user signs in:",
              body: (
                <Box as="ol" pl="5" mt="1">
                  <Box as="li" mb="1">Open PSAT. The Landing Page lists all profiles registered on this device.</Box>
                  <Box as="li" mb="1">Click the desired profile to select it (highlighted in green).</Box>
                  <Box as="li" mb="1">Click <strong>Start As &lt;Name&gt;</strong>. A PIN prompt appears if this is not the currently active session.</Box>
                  <Box as="li" mb="1">Enter the PIN and confirm. The user is now logged in and taken to their Projects page.</Box>
                  <Box as="li">All previously saved projects for that profile are immediately available.</Box>
                </Box>
              ),
            },
            {
              label: "Creating a new account:",
              body: (
                <Box as="ol" pl="5" mt="1">
                  <Box as="li" mb="1">On the Landing Page, click <strong>Create Profile</strong>.</Box>
                  <Box as="li" mb="1">Enter a profile name, division, and a 4–12 digit numeric PIN.</Box>
                  <Box as="li">Click <strong>Create Profile</strong>. The profile is saved and the user is automatically logged in.</Box>
                </Box>
              ),
            },
            {
              label: "Switching accounts:",
              body: <>Click <strong>Log Out</strong> in the sidebar at any time to return to the Landing Page. Select a different profile and sign in with that profile's PIN.</>,
            },
            {
              label: "Note:",
              body: "The active session is device-local. All open browser tabs on the same device share the same active profile. Logging out from one tab affects all open tabs on that device.",
            },
          ],
        },
        {
          title: "7. Admin Dashboard — Usage Tracking",
          items: [
            {
              label: "Overview:",
              body: "The Admin Dashboard lets you monitor usage without being physically present. It shows total accounts created, logins today, all-time login totals, a daily login bar chart, and a per-account breakdown of projects and login history.",
            },
            {
              label: "How to access the Admin Dashboard:",
              body: (
                <Box as="ol" pl="5" mt="1">
                  <Box as="li" mb="1">Log in to any profile on the device (or access the PSAT URL on the network).</Box>
                  <Box as="li" mb="1">Navigate to the <strong>Projects</strong> page (Home).</Box>
                  <Box as="li" mb="1">Click <strong>Admin Dashboard</strong> in the lower section of the left-hand sidebar.</Box>
                  <Box as="li">The dashboard loads immediately with live data from the local database — no extra password required.</Box>
                </Box>
              ),
            },
            {
              label: "Reading the summary cards:",
              body: (
                <Box as="ul" pl="5" mt="1">
                  <Box as="li" mb="1"><strong>Total Accounts Created</strong> — the number of profiles registered on this installation.</Box>
                  <Box as="li" mb="1"><strong>Logins Today</strong> — successful sign-in events recorded since midnight UTC.</Box>
                  <Box as="li"><strong>Total Logins (All Time)</strong> — cumulative login count across all profiles since installation.</Box>
                </Box>
              ),
            },
            {
              label: "Daily login chart:",
              body: <>The bar chart shows login frequency over a rolling window. Use the tabs above the chart to switch between <strong>7d / 14d / 30d / 90d</strong> views. Each bar represents one calendar day; hover to see the exact count for that day.</>,
            },
            {
              label: "All Accounts table:",
              body: (
                <Box as="ul" pl="5" mt="1">
                  <Box as="li" mb="1"><strong>Name</strong> — the profile's display name.</Box>
                  <Box as="li" mb="1"><strong>Division</strong> — team or department entered at account creation.</Box>
                  <Box as="li" mb="1"><strong>Projects</strong> — number of projects currently saved under this profile.</Box>
                  <Box as="li" mb="1"><strong>Logins</strong> — total number of times this account has signed in (all time).</Box>
                  <Box as="li" mb="1"><strong>Created</strong> — date the profile was first created.</Box>
                  <Box as="li"><strong>Last Active</strong> — date of the most recent login for this profile.</Box>
                </Box>
              ),
            },
            {
              label: "Remote access (without being physically present):",
              body: (
                <>
                  If PSAT is deployed on a shared server or behind a VPN, open a browser on any machine that can reach the PSAT address and navigate to{" "}
                  <Code>/admin</Code> (e.g. <Code>http://&lt;server&gt;:&lt;port&gt;/admin</Code>). The dashboard loads without a separate admin login. Restrict network access (firewall / VPN) to control who can view it.
                </>
              ),
            },
            {
              label: "Refreshing the data:",
              body: <>Click the <strong>⟳ Refresh</strong> button at the top right of the Admin Dashboard at any time to reload the latest figures from the database without leaving the page.</>,
            },
            {
              label: "Raw data access:",
              body: <>All login events are stored in <Code>profiles/telemetry.sqlite3</Code> on the server. This file can be queried directly with any SQLite client (e.g. DB Browser for SQLite) for custom reports. The relevant table is <Code>activity_events</Code>; filter on <Code>event_type = 'profile_login'</Code>.</>,
            },
          ],
        },
      ].map((section) => (
        <Box key={section.title}>
          <Text fontSize="lg" fontWeight="semibold" color="gray.700" _dark={{ color: "gray.200" }} mt="6" mb="3">
            {section.title}
          </Text>
          <Box as="ul" pl="6" color="gray.600" _dark={{ color: "gray.400" }} lineHeight="1.7">
            {section.items.map((item) => (
              <Box as="li" key={item.label} mb="2">
                <Text as="span" fontWeight="bold" color="gray.700" _dark={{ color: "gray.200" }}>{item.label}</Text>{" "}
                {item.body}
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <Box
      as="code"
      bg="gray.100"
      _dark={{ bg: "gray.700", color: "red.300" }}
      px="1"
      py="0.5"
      borderRadius="sm"
      fontFamily="mono"
      fontSize="0.875em"
      color="red.600"
    >
      {children}
    </Box>
  );
}
