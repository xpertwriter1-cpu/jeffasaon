export const metadata = { title: 'Photo credits' };
export default function PhotoCredits() {
  return (
    <div className="container page credits">
      <h1>Photo credits</h1>
      <p>
        These representative photographs show preschool life in Africa. They are not
        photographs of Jeffersons Preschool or its enrolled children.
      </p>
      <ul>
        <li>
          <a href="https://commons.wikimedia.org/wiki/File:Preschool_in_cape_town_south_africa.jpg">
            Preschool in Cape Town, South Africa
          </a>{' '}
          by Mhlayifani, via Wikimedia Commons.{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.
          Displayed at responsive sizes and cropped to fit the layout.
        </li>
        <li>
          <a href="https://commons.wikimedia.org/wiki/File:Preschool_teacher.png">
            Preschool teacher in Douala, Cameroon
          </a>{' '}
          by Minette Lontsie, via Wikimedia Commons.{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.
          Displayed at responsive sizes and cropped to fit the layout.
        </li>
      </ul>
      <p>The photographs and any adapted image versions retain the same licence.</p>
    </div>
  );
}
