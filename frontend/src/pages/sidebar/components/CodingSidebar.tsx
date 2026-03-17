import { Button, Flex, Spacer, Grid, GridItem } from "@chakra-ui/react";

type CodingSidebarProps = {
  projectName: string;
  onSave: () => Promise<void> | void;
  onExit: () => void;

  // Auto-coding callbacks
  onAutoCodeOne: () => Promise<void> | void;
  onAutoCodeAll: () => Promise<void> | void;
  onAutoCodeAllProjects: () => Promise<void> | void;
};

export default function CodingSidebar({
  onSave,
  onExit,
  onAutoCodeOne,
  onAutoCodeAll,
  onAutoCodeAllProjects,
}: CodingSidebarProps) {
  return (
    <Flex direction="column" h="100%">

      <Grid
        w="100%"
        minW={0}
        templateColumns="repeat(2, minmax(0, 1fr))"
        columnGap={2}
        rowGap={3}
        mt="auto"
      >
      <Button onClick={onAutoCodeOne} w="100%" size="sm" variant="outline" colorPalette="gray">
        Auto-code
      </Button>

      <Button onClick={onAutoCodeAll} w="100%" size="sm" variant="outline" colorPalette="gray">
        Auto-code all
      </Button>

      <GridItem colSpan={2}>
        <Button onClick={onAutoCodeAllProjects} w="100%" size="sm" variant="outline" colorPalette="blue">
          Autocode All Projects
        </Button>
      </GridItem>
      </Grid>

      <Spacer />

      <Grid
        w="100%"
        minW={0}
        templateColumns="repeat(2, minmax(0, 1fr))"
        columnGap={2}
        rowGap={3}
        mt="auto"
      >

        <GridItem>
          <Button onClick={onSave} w="100%" size="sm" variant="solid" colorPalette="gray">
            Save
          </Button>
        </GridItem>

        <GridItem>
          <Button onClick={onExit} w="100%" size="sm" variant="subtle" colorPalette="gray">
            Exit
          </Button>
        </GridItem>
      </Grid>
    </Flex>
  );
}
