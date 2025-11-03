import { Slider as ChakraSlider } from "@chakra-ui/react"
import * as React from "react"

export interface SliderProps extends ChakraSlider.RootProps {
  marks?: Array<number | { value: number; label: React.ReactNode }>
  label?: React.ReactNode
}

export const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  function Slider(props, ref) {
    const { marks: marksProp, label, ...rest } = props
    const value = props.value ?? props.defaultValue

    const marks = marksProp?.map((mark) => {
      if (typeof mark === "number") return { value: mark, label: undefined }
      return mark
    })

    const hasMarkLabel = !!marks?.some((mark) => mark.label)

    return (
      <ChakraSlider.Root ref={ref} thumbAlignment="center" {...rest}>
        {label && <ChakraSlider.Label>{label}</ChakraSlider.Label>}
        <ChakraSlider.Control data-has-mark-label={hasMarkLabel || undefined}>
          <ChakraSlider.Track>
            <ChakraSlider.Range />
          </ChakraSlider.Track>
          {value?.map((_, index) => (
            <ChakraSlider.Thumb key={index} index={index}>
              <ChakraSlider.HiddenInput />
            </ChakraSlider.Thumb>
          ))}
        </ChakraSlider.Control>
        {marks && (
          <ChakraSlider.MarkerGroup>
            {marks.map((mark, index) => {
              const value = typeof mark === "number" ? mark : mark.value
              const label = typeof mark === "number" ? undefined : mark.label
              return (
                <ChakraSlider.Marker key={index} value={value}>
                  <ChakraSlider.MarkerIndicator />
                  {label}
                </ChakraSlider.Marker>
              )
            })}
          </ChakraSlider.MarkerGroup>
        )}
      </ChakraSlider.Root>
    )
  },
)
