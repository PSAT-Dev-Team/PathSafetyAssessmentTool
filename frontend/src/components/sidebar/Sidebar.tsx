import { useLocation, useNavigate, useMatch  } from "react-router-dom";
import { Button, Box, Text, VStack, Flex, Spacer, useDisclosure, Dialog, Portal, CloseButton } from "@chakra-ui/react"
import { useMemo, useRef } from "react";

import "./sidebar.css";

const LINKS = [
  { to: "/home", label: "Home" },
  { to: "/analysis", label: "Analysis" },
]

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  

  const createProject = () => {
    navigate(`/projects/create`);
  }

  const navigateSidebar = (to: string) => {
    navigate(to);
  }

  // Get the project name
  const codingMatch = useMatch("/coding/:projectName");
  const rawProjectName = codingMatch?.params.projectName ?? null;
  const projectName = useMemo(() => {
    if (!rawProjectName) return null;
    try {
      return decodeURIComponent(rawProjectName);
    } catch {
      return rawProjectName;
    }
  }, [rawProjectName]);

  const inCoding = pathname.startsWith("/coding");

  const onCalculate = async () => {
    // TODO: 调你的 "计算分数 + treatment" API，然后把结果存起来/提示
    console.log("Calculate score & treatment for:", projectName);
  };

  const onSave = async () => {
    // TODO: 保存当前项目的计算/编辑状态
    console.log("Save project:", projectName);
  };
  const {
    isOpen: isExitOpen,
    onOpen: openExit,
    onClose: closeExit,
  } = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement>(null);

  const saveAndExit = async () => {
    try {
      await onSave();
      closeExit();
      navigate("/home");
    } catch (e) {
      console.error(e);
    }
  };
  const exitWithoutSave = async () => {
    closeExit();
    navigate("/home");
  };


  return (
    <aside className="psat-sidebar" aria-label="PSAT sidebar">
      {/* Top: PSAT + buttons */}
      <div className="psat-side-top">
        <div className="psat-brand">PSAT</div>
        
        <div className="psat-actions">
          {LINKS.map(({ to, label }) => {
            const active = pathname.startsWith(to)
            return (
              <Button
                onClick={() => navigateSidebar(to)}
                key={to}
                colorPalette="gray"
                variant={active ? "solid" : "outline"}
                size="sm"
              >
                {label}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Middle: placeholder */}
      <div className="psat-side-middle">
        {inCoding && projectName ? (
          <Flex direction="column" h="100%">
            <Box>
              <Text fontSize="md">
                Current Project:
              </Text>
              <Text fontSize="sm" opacity={0.8}>
                {projectName}
              </Text>
            </Box>

            <Spacer />

            <VStack align="stretch" gap="3" mt="auto">
              <Button onClick={onCalculate} colorPalette="gray" variant="solid" size="sm">
                Calculate Score & Treatment
              </Button>
              <Button onClick={onSave} colorPalette="gray" variant="outline" size="sm">
                Save
              </Button>
              <Button onClick={openExit} colorPalette="gray" variant="ghost" size="sm">
                Exit
              </Button>
            </VStack>
          </Flex>
        ):(
        <div className="placeholder">Placeholder</div>
        )}
      </div>

      {/* Bottom: Create Project */}
      <div className="psat-side-bottom">
          <Button
            onClick={createProject}
            colorPalette="grey"
            variant="solid"
            size="sm"
          >
            Create Project
          </Button>
      </div>
      
    </aside>
  );
}
