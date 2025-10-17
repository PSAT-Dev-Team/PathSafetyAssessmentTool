import { Button, Flex, Spacer, Grid, GridItem } from "@chakra-ui/react";

type CodingSidebarProps = {
  projectName: string;
  onCalculate: () => Promise<void> | void;
  onSave: () => Promise<void> | void;
  onExit: () => void;

  // 新增：自动编码
  onAutoCodeOne: () => Promise<void> | void;
  onAutoCodeAll: () => Promise<void> | void;
};

export default function CodingSidebar({
  projectName,
  onCalculate,
  onSave,
  onExit,
  onAutoCodeOne,
  onAutoCodeAll,
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

        <GridItem colSpan={2}>
          <Button onClick={onCalculate} w="100%" size="sm" variant="outline" colorPalette="gray">
            Calculate Score & Treatment
          </Button>
        </GridItem>

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
