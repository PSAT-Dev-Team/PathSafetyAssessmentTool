import { Button, Flex, Spacer, Grid, GridItem } from "@chakra-ui/react";

type TreatmentSidebarProps = {
  onTreatAll: () => Promise<void> | void;
  onResetAll: () => Promise<void> | void;
  onSave: () => Promise<void> | void;
  onExit: () => void;
};

export default function TreatmentSidebar({
  onTreatAll,
  onResetAll,
  onSave,
  onExit,
}: TreatmentSidebarProps) {
  return (
    <Flex direction="column" h="100%">
      <Grid
        w="100%"
        minW={0}
        templateColumns="1fr"
        rowGap={3}
        mt={-6}
      >
        <Button
          onClick={onTreatAll}
          w="100%"
          size="sm"
          variant="solid"
          colorPalette="green"
        >
          Treat All Segments
        </Button>

        <Button
          onClick={onResetAll}
          w="100%"
          size="sm"
          variant="outline"
          colorPalette="red"
        >
          Reset All
        </Button>
      </Grid>

      <Spacer minH={3} />

      <Grid
        w="100%"
        minW={0}
        templateColumns="repeat(2, minmax(0, 1fr))"
        columnGap={2}
        rowGap={3}
      >
        <GridItem>
          <Button
            onClick={onSave}
            w="100%"
            size="sm"
            variant="solid"
            colorPalette="gray"
          >
            Save
          </Button>
        </GridItem>

        <GridItem>
          <Button
            onClick={onExit}
            w="100%"
            size="sm"
            variant="subtle"
            colorPalette="gray"
          >
            Exit
          </Button>
        </GridItem>
      </Grid>
    </Flex>
  );
}
