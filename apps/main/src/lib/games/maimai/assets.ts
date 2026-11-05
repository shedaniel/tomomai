export function getRatingImageUrl(rating: number, version: number) {
  const variant = rating >= 16000 && version >= 13 ? "kiwami"
    : rating >= 15000 ? "rainbow"
      : rating >= 14500 ? "platinum"
        : rating >= 14000 ? "gold"
          : rating >= 13000 ? "silver"
            : rating >= 12000 ? "bronze"
              : rating >= 10000 ? "purple"
                : rating >= 7000 ? "red"
                  : rating >= 4000 ? "orange"
                    : rating >= 2000 ? "green"
                      : rating >= 1 ? "blue"
                        : "normal";

  return `/res/rating/${variant}.png`;
}
