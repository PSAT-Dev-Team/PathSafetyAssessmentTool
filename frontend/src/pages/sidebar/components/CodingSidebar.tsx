import { Box, Text, VStack, HStack, Button, Flex, Spacer } from "@chakra-ui/react";
import { Grid, GridItem } from "@chakra-ui/react"

type CodingSidebarProps = {
  projectName: string;
  onCalculate: () => Promise<void> | void;
  onSave: () => Promise<void> | void;
  onExit: () => void; // 触发父级的退出逻辑（比如弹窗或直接导航）
};

export default function CodingSidebar({
  projectName,
  onCalculate,
  onSave,
  onExit,
}: CodingSidebarProps) {
  return (
    <Flex direction="column" h="100%">
      <Box>
        <Text fontSize="md">Current Project:</Text>
        <Text fontSize="sm" opacity={0.8}>
          {projectName}
        </Text>
      </Box>

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
